# Distributed Webhook Dispatcher Engine - Architecture Specification

## 1. System Overview

The **Distributed Webhook Dispatcher Engine** is an asynchronous, high-throughput, fault-tolerant backend system designed to ingest internal event notifications and reliably deliver them to external third-party destination servers.

Directly dispatching webhooks synchronously within an API handler causes thread exhaustion, high API response latency, and dropped events when external servers are slow or unavailable.

This engine decouples **ingestion** from **delivery** using:
1. **Express.js API Layer**: Validates requests via Zod, enforces strict idempotency on `eventId`, persists event state to PostgreSQL, enqueues delivery jobs to Redis, and returns `HTTP 202 Accepted` immediately (< 30ms).
2. **BullMQ & Redis Queue**: Provides distributed job orchestration, persistence, delayed retry scheduling, and concurrency controls.
3. **Background Delivery Worker**: Can run in-process (`RUN_WORKER_IN_PROCESS=true` for single-service free-tier deployment on Render) or as dedicated standalone processes in Docker Compose.
4. **PostgreSQL**: Serves as the durable system of record, storing webhook events, status transitions, and granular delivery attempt logs.
5. **Built-in Mock Receiver (`/mock`)**: Provides deterministic endpoints (`/mock/ok`, `/mock/fail`, `/mock/flaky`, `/mock/slow`, `/mock/ratelimit`) for live testing without third-party dependencies.

```
                    +-------------------------------------------------------------+
                    |                CLIENT APPLICATION / REACT UI                |
                    +-------------------------------------------------------------+
                                                   |
                             POST /api/webhooks/dispatch (Payload + eventId)
                                                   v
                    +-------------------------------------------------------------+
                    |                   EXPRESS.JS INGESTION API                  |
                    |   - Zod Schema Validation & Protocol Check                  |
                    |   - Idempotency Check (unique eventId + P2002 handling)     |
                    |   - Immediate PostgreSQL Persistence (Status: QUEUED)       |
                    |   - Redis Queue Enqueue (BullMQ Job)                        |
                    |   - Immediate HTTP 202 Accepted Response (< 30ms)           |
                    +-------------------------------------------------------------+
                                  |                               |
                 Persist Event    |                               | Enqueue Job
                                  v                               v
                     +------------------------+      +------------------------+
                     |  PostgreSQL Database   |      |      Redis Queue       |
                     |    (System of Record)  |      |   (BullMQ Dispatcher)  |
                     +------------------------+      +------------------------+
                                                                  |
                                                     Job Pop      | Delayed Retry
                                                                  v
                    +-------------------------------------------------------------+
                    |             BULLMQ BACKGROUND WORKER PROCESS                |
                    |   (Embedded in API on Render or Standalone in Docker)       |
                    |                                                             |
                    |   1. Verify Event Status (Skips DELIVERED/FAILED;           |
                    |      allows re-running PROCESSING for stalled recovery)     |
                    |   2. Check Destination-Domain Rate Limit (Redis Lua)        |
                    |      -> If limit reached: re-enqueue with computed delay   |
                    |         WITHOUT counting as failed attempt                  |
                    |   3. SSRF Validation & DNS IP Pinning                       |
                    |      -> Pin validated IP on http/https agents               |
                    |      -> Block private/loopback/cloud metadata IPs           |
                    |   4. Outbound HTTP Delivery (Axios with 10s Timeout)        |
                    |      -> Standard Headers: X-Event-Id, X-Delivery-Attempt    |
                    |   5. Record DeliveryAttempt Record to PostgreSQL            |
                    |   6. Evaluate Delivery Result & Retry Classification        |
                    |      -> 2xx Success: Mark DELIVERED                         |
                    |      -> 4xx Client Error / SSRF: Mark FAILED (No Retry)     |
                    |      -> 5xx / 429 / Timeout: Re-enqueue with Exponential    |
                    |         Backoff Delay (2s, 4s, 8s -> Max 4 Total Attempts)  |
                    +-------------------------------------------------------------+
                                                   |
                                                   v
                    +-------------------------------------------------------------+
                    |              DOWNSTREAM DESTINATION ENDPOINT                |
                    |     (External Server or Built-in /mock Mock Receivers)      |
                    +-------------------------------------------------------------+
```

---

## 2. Key Architectural Guarantees

### 2.1 At-Least-Once Delivery Semantics
The system guarantees **at-least-once delivery**. In the event of a worker crash, network timeout, or socket disconnect after the receiver has processed the request but before the response reaches the dispatcher, the job will be retried. Downstream receivers should implement idempotency using the provided `X-Event-Id` header.

### 2.2 Non-Blocking Ingestion
The ingestion API performs only two fast operations:
1. One indexed database write (or idempotency lookup).
2. One Redis `LPUSH`/sorted set write via BullMQ.

The API response returns in under 30 milliseconds, completely decoupled from downstream response latency (even if the downstream server takes 10+ seconds to respond).

### 2.3 Strict Idempotency & Concurrent Conflict Handling
- If a client resubmits an existing `eventId` with matching `destinationUrl` and `payload`, the engine immediately returns `HTTP 202` with the existing `jobId`. No duplicate delivery is triggered.
- If a client resubmits an existing `eventId` with **different** `destinationUrl` or `payload`, the engine rejects the request with `HTTP 409 Conflict`.
- Under concurrent ingestion races, Prisma's `P2002` unique constraint violation is caught, verifying the payload and returning 202 or 409 accordingly.

### 2.4 Stalled Job Recovery
If a worker crashes while an event status is `PROCESSING`, subsequent re-runs are permitted. The worker guard skips only `DELIVERED` and `FAILED` events, allowing stalled `PROCESSING` jobs to finish.

### 2.5 Unique BullMQ Retries with Stable Client Job ID
The client-facing `jobId` in PostgreSQL remains stable (`job_<uuid>`). BullMQ retries and rate-limit deferrals use suffixed queue identifiers (`${jobId}:r${n}` and `${jobId}:d:${timestamp}`) to prevent job ID collision in Redis.

### 2.6 Atomic Per-Domain Sliding-Window Rate Limiting
Outbound traffic is shaped per destination domain using an atomic Redis Lua script. Rate-limited jobs are delayed without recording false failed delivery attempts. If Redis encounters an error during rate limiting, the limiter **fails open** to ensure delivery progress is not halted.

### 2.7 SSRF Defense & DNS IP Pinning
To prevent Server-Side Request Forgery and DNS Rebinding (TOCTOU attacks):
1. Destination URLs are resolved via DNS.
2. All resolved IP addresses are checked against private, loopback, link-local, and cloud metadata CIDR ranges (including `169.254.169.254` and `metadata.google.internal`).
3. The validated IP is **pinned directly on custom HTTP/HTTPS agents via the `lookup` hook**, guaranteeing that the socket connects to the exact IP that was validated.

### 2.8 Free-Tier Redis Friendliness
To support free managed Redis providers (Render Redis, Upstash) with command limits:
- BullMQ worker uses `drainDelay: 30` (30s polling when idle instead of 5s).
- Worker uses `stalledInterval: 60000` (60s check for stalled locks instead of 30s).
- Completed jobs are pruned after 1 hour (`age: 3600, count: 2000`).
- Failed jobs are pruned after 24 hours (`age: 86400, count: 5000`).
