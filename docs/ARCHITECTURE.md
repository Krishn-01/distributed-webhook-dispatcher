# Distributed Webhook Dispatcher Engine - Architecture Specification

## 1. System Overview

The **Distributed Webhook Dispatcher Engine** is an asynchronous, high-throughput, fault-tolerant backend system designed to ingest internal event notifications and reliably broadcast them to external third-party destination servers.

External endpoints often suffer from high latency, intermittent network failures, rate limiting (HTTP 429), or complete outages. Directly dispatching webhooks synchronously within an API handler causes thread exhaustion, high API response latency, and dropped events.

This engine decouples **ingestion** from **delivery** using:
1. **Express.js API Layer**: Validates requests, enforces idempotency, persists event state to PostgreSQL, enqueues delivery jobs to Redis, and returns `HTTP 202 Accepted` immediately (< 30ms).
2. **BullMQ & Redis Queue**: Provides distributed job orchestration, persistence, delayed retry scheduling, and concurrency controls across horizontal workers.
3. **Dedicated Background Workers**: Consume jobs from Redis, execute atomic per-domain rate limiting, perform SSRF-safe HTTP POST requests, record detailed delivery attempt telemetry, and apply exponential backoff.
4. **PostgreSQL**: Serves as the durable system of record, storing webhook events, status transitions, and granular delivery attempt logs.

```
                    +-------------------------------------------------------------+
                    |                      CLIENT APPLICATION                     |
                    +-------------------------------------------------------------+
                                                   |
                             POST /api/webhooks/dispatch (Payload + eventId)
                                                   v
                    +-------------------------------------------------------------+
                    |                   EXPRESS.JS INGESTION API                  |
                    |   - Zod Schema Validation & Protocol Check                  |
                    |   - Idempotency Check (unique eventId)                      |
                    |   - Immediate PostgreSQL Persistence (Status: QUEUED)       |
                    |   - Redis Queue Enqueue (BullMQ Job)                        |
                    |   - Immediate HTTP 202 Accepted Response                    |
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
                    |              DISTRIBUTED WORKER PROCESS(ES)                 |
                    |                                                             |
                    |   Step 1: Check Domain Rate Limit (Atomic Redis Lua Script) |
                    |           -> If exhausted: Re-enqueue with delay (no fail)  |
                    |                                                             |
                    |   Step 2: SSRF & DNS Validation                             |
                    |           -> Block private / loopback / cloud metadata IPs  |
                    |                                                             |
                    |   Step 3: Dispatch Outbound HTTP POST with Payload          |
                    |           -> Timeout: 10,000ms                              |
                    |                                                             |
                    |   Step 4: Analyze Response / Failure                        |
                    |           - Success (2xx): Mark DELIVERED                   |
                    |           - 4xx (except 429): Mark FAILED (No Retry)        |
                    |           - 5xx, 429, Timeout, Network Error:               |
                    |               -> Calculate Backoff (2s, 4s, 8s)             |
                    |               -> If attempt < 4: Re-enqueue (RETRYING)      |
                    |               -> If attempt == 4: Mark FAILED               |
                    |                                                             |
                    |   Step 5: Record DeliveryAttempt in PostgreSQL              |
                    +-------------------------------------------------------------+
                                                   |
                                                   v
                    +-------------------------------------------------------------+
                    |                  EXTERNAL DESTINATION SERVER                |
                    |                (Client Webhook Receiver Target)             |
                    +-------------------------------------------------------------+
```

---

## 2. Ingestion & Idempotency Workflow

1. Client issues `POST /api/webhooks/dispatch` with:
   ```json
   {
     "destinationUrl": "https://client.api.com/webhook",
     "eventId": "evt_abc123",
     "payload": { "event": "order.completed", "amount": 99.00 }
   }
   ```
2. **Validation**: Zod schema checks URL format (http/https only) and ensures payload is a valid non-empty object.
3. **Idempotency Guard**:
   - The database enforces a `UNIQUE` constraint on `eventId`.
   - If an event with the given `eventId` already exists:
     - Return `200 OK` or `202 Accepted` with the existing `jobId` and status `already_queued`.
     - Prevent duplicate queueing or duplicate delivery attempts.
4. **Non-blocking Guarantee**:
   - The event is persisted to PostgreSQL with status `QUEUED`.
   - BullMQ adds the job to the Redis queue `webhook-delivery-queue`.
   - The API immediately responds with:
     ```json
     {
       "status": "queued",
       "jobId": "job_948f98ec-...",
       "eventId": "evt_abc123"
     }
     ```
   - Total latency: < 30ms.

---

## 3. Distributed Rate Limiting (Token Bucket / Sliding Window)

To prevent overwhelming destination servers, rate limits are enforced **per destination domain**:

- **Domain Normalization**: Hostnames extracted using WHATWG URL parser (e.g. `https://api.example.com:443/webhook` -> `api.example.com`).
- **Algorithm**: Redis Sliding-Window Counter via atomic Lua script.
  - Lua script checks the count of requests made to `ratelimit:domain:{destinationDomain}` within the current sliding window (e.g., 10 requests / 1000ms).
  - If tokens are available: increment counter, set TTL, return `allowed = true`.
  - If limit reached: calculate time remaining until oldest token expires, return `allowed = false, retryAfterMs = X`.
- **Deferral Without Failure**:
  - When a job is rate-limited, the worker re-enqueues or delays the job in BullMQ by `retryAfterMs`.
  - **Crucial**: Rate-limit deferral does NOT increment the event's `attemptCount` and is NOT logged as a failed HTTP delivery attempt.

---

## 4. Exponential Backoff & Retry Policy

When an HTTP delivery fails, the worker categorizes the error:

### Retryable Errors:
- HTTP 5xx (500 Internal Server Error, 502 Bad Gateway, 503 Service Unavailable, 504 Gateway Timeout).
- HTTP 429 Too Many Requests.
- Connection timeouts (`ETIMEDOUT`, Axios timeout).
- Network disconnections (`ECONNREFUSED`, `ENOTFOUND`, `EAI_AGAIN`).

### Non-Retryable Errors:
- HTTP 4xx (400 Bad Request, 401 Unauthorized, 403 Forbidden, 404 Not Found, 422 Unprocessable Entity).
  - *Exception*: HTTP 429 is retryable.
- SSRF security violations (blocked private IPs).

### Backoff Schedule:
- Maximum retries: 3 after initial attempt (Total 4 attempts maximum).
- **Attempt 1**: Immediate upon pickup.
- **Attempt 2 (Retry 1)**: $2^1 = 2$ seconds delay ($2000\text{ ms}$).
- **Attempt 3 (Retry 2)**: $2^2 = 4$ seconds delay ($4000\text{ ms}$).
- **Attempt 4 (Retry 3)**: $2^3 = 8$ seconds delay ($8000\text{ ms}$).
- If attempt 4 fails: event status transitions to `FAILED`.

---

## 5. Security & SSRF Protection

To prevent Server-Side Request Forgery (SSRF):
1. **Protocol Restriction**: Only `http:` and `https:` schemes allowed.
2. **DNS Resolution & IP Filtering**: Before executing HTTP requests, resolve hostname via DNS. Block connections to:
   - Loopback addresses (`127.0.0.0/8`, `::1`).
   - Private subnets (RFC 1918: `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`).
   - Link-local addresses (`169.254.0.0/16`, `fe80::/10`).
   - Cloud metadata services (e.g. `169.254.169.254` for AWS/GCP/Azure).
3. **DNS Rebinding Prevention**: Pin the validated IP address to the outbound connection agent or verify resolution immediately prior to socket connection.
4. **Safe Redirect Handling**: Disable automatic redirects (`maxRedirects: 0`) or re-validate every redirect URL through the SSRF filter.

