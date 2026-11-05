# Distributed Webhook Dispatcher Engine

Live Demo URL: `https://<YOUR-APP>.onrender.com` *(replace me)*

> **Note on Free-Tier Hosting:** Render free web services spin down after 15 minutes of inactivity and take ~50 seconds to wake on the first request. Open `/health` in your browser first to verify the instance is awake before testing webhooks. Render free tier pairs smoothly with [Neon](https://neon.tech) / [Supabase](https://supabase.com) for PostgreSQL and [Upstash](https://upstash.com) for Redis.

---

## 1. Project Overview

The **Distributed Webhook Dispatcher** is a production-grade, asynchronous event distribution engine built with Node.js, Express, TypeScript, BullMQ, Redis, PostgreSQL, and React. It accepts outbound webhook requests with immediate non-blocking acknowledgment (`HTTP 202 Accepted`), persists all event and attempt states, reliably delivers payloads in the background with exponential backoff (2s, 4s, 8s), enforces per-destination-domain sliding-window rate limits (10 req/s), and provides a modern SaaS developer dashboard.

---

## 2. Problem Statement

Modern microservice and SaaS architectures frequently trigger webhooks to notify external customer APIs (e.g. `order.created`, `payment.failed`, `user.signup`). Directly issuing HTTP requests during user transactions causes critical failures:
1. **Thread Blocking:** Slow or unresponsive downstream receivers stall application servers.
2. **Cascading Failures:** Downstream timeouts or server outages cause unhandled message loss.
3. **Target Flooding:** High-volume traffic spikes trigger downstream rate limiting (`HTTP 429`) or server crashes.
4. **Security Vulnerabilities:** Naive outbound requests expose internal networks to Server-Side Request Forgery (SSRF) and DNS rebinding attacks.

This engine solves these challenges through durable background queues, atomic sliding-window rate limiting, exponential backoff retries, and hardened SSRF DNS IP pinning.

---

## 3. Key Features

- **Non-blocking Ingestion:** Responds in `< 35ms` with `HTTP 202 Accepted` and a unique `jobId`.
- **Durable Redis Queue:** Powered by BullMQ for high-throughput, low-latency job scheduling.
- **PostgreSQL Audit Log:** Relational persistence for events and chronological delivery attempts.
- **Exponential Backoff:** Retries 5xx, 429, timeouts, and network drops (delays: 2s, 4s, 8s; max 4 attempts total).
- **Per-Domain Rate Limiting:** Atomic Redis Lua script enforcing a 10 req/s sliding window without packet loss.
- **SSRF Defense with IP Pinning:** Validates DNS, rejects private/cloud metadata ranges (`169.254.169.254`), and pins socket IPs via custom agent lookups.
- **Mock Receivers Included:** Built-in test endpoints (`/mock/ok`, `/mock/fail`, `/mock/flaky`, `/mock/slow`, `/mock/ratelimit`).
- **SaaS Developer Dashboard:** React 19 + Tailwind CSS dashboard with live 1s polling, KPI cards, interactive JSON editor, attempt timeline, and searchable job history.
- **Single-Process Deployment:** Can deploy as a standalone worker container or a single combined web service (`RUN_WORKER_IN_PROCESS=true`).

---

## 4. Architecture Diagram

```mermaid
flowchart TD
    Client["Client / UI / Webhook Producer"] -->|"POST /api/webhooks/dispatch"| API["Express Ingestion API"]
    
    subgraph Ingestion ["Ingestion Tier (< 35ms)"]
        API -->|"1. Validate Zod Schema & SSRF"| Validate["Validation & SSRF Check"]
        API -->|"2. Write Event (Status: QUEUED)"| DB[(PostgreSQL Database)]
        API -->|"3. Enqueue Job"| Queue["BullMQ Queue (Redis)"]
        API -->|"4. Return HTTP 202 Accepted"| Client
    end

    subgraph ProcessingTier ["Background Worker Engine"]
        Queue -->|"5. Dequeue Job"| Worker["BullMQ Background Worker"]
        Worker -->|"6. Check Rate Limit (Lua ZSET)"| RateLimit{"10 req/s Window Exceeded?"}
        RateLimit -- "Yes" -->|"Defer with Delay"| Queue
        RateLimit -- "No" --> Outbound["Axios Outbound Dispatcher"]
        
        Outbound -->|"7. DNS IP Pinning Agent"| Target["Target Destination Server"]
        Outbound -->|"8. Record Attempt (duration, code, status)"| DB
        
        Target -->|"2xx Success"| Success["Mark Event DELIVERED"]
        Target -->|"5xx / 429 / Timeout"| RetryCheck{"Attempts < 4?"}
        RetryCheck -- "Yes (Retry 1, 2, 3)" -->|"Re-enqueue (2s, 4s, 8s backoff)"| Queue
        RetryCheck -- "No (Max Exceeded)" --> Fail["Mark Event FAILED"]
        Target -->|"4xx (Permanent) or SSRF"| Fail
    end
```

---

## 5. Technology Stack

- **Runtime & Language:** Node.js 22 LTS, TypeScript (strict mode enabled).
- **Web Framework:** Express.js, helmet, cors, pino-http.
- **Queue Engine:** BullMQ, ioredis (supports Redis and TLS `rediss://`).
- **Database & ORM:** PostgreSQL 16, Prisma ORM.
- **Frontend Dashboard:** React 19, Vite, Tailwind CSS v4.
- **API Documentation:** OpenAPI 3.0 / Swagger UI (`/docs`).
- **Testing:** Jest, ts-jest, supertest.
- **Containerization:** Docker multi-stage build, Docker Compose.

---

## 6. System Workflow

1. **Ingestion:** Client sends `POST /api/webhooks/dispatch` with `destinationUrl`, `eventId`, and `payload`.
2. **Validation & Idempotency:** Zod validates inputs; database checks for existing `eventId`. If duplicate with same payload, returns original `jobId` (`202`); if payload conflicts, returns `409 Conflict`.
3. **Queuing:** Event is written to PostgreSQL as `QUEUED`, and enqueued into BullMQ with a stable client job ID. API immediately responds with `HTTP 202 Accepted`.
4. **Worker Consumption:** BullMQ worker receives the job and verifies the event state has not already reached `DELIVERED` or `FAILED`.
5. **Rate Limiting:** Worker executes a Redis Lua script against the destination domain. If the 1000ms window has exceeded 10 requests, the job is deferred without incrementing failed attempt counts.
6. **Delivery & SSRF Pinning:** Outbound request is executed via custom `http`/`https` agents that pin DNS resolution to prevent rebinding attacks.
7. **Attempt Persistence:** Attempt details (duration, HTTP status, error message, attempt number) are committed to `delivery_attempts` in PostgreSQL.
8. **Retry Evaluation:** On 5xx, 429, or timeout, a delayed BullMQ job is scheduled with exponential backoff (`2s`, `4s`, `8s`). On 2xx, event is updated to `DELIVERED`. On 4xx or 4 attempts exhausted, marked `FAILED`.

---

## 7. Database Schema Overview

```
┌─────────────────────────────────┐       ┌─────────────────────────────────┐
│         webhook_events          │       │        delivery_attempts        │
├─────────────────────────────────┤       ├─────────────────────────────────┤
│ id (PK, UUID)                   │◄──┐   │ id (PK, UUID)                   │
│ eventId (Unique, Index)         │   └───│ webhookEventId (FK, Index)      │
│ jobId (Unique, Index)           │       │ attemptNumber (Int)             │
│ destinationUrl (Text)           │       │ status (SUCCESS/FAILED/RETRY)   │
│ destinationDomain (Index)       │       │ responseCode (Int, Nullable)    │
│ payload (JSONB)                 │       │ errorMessage (Text, Nullable)   │
│ status (QUEUED/PROC/DELIV/FAIL) │       │ durationMs (Int)                │
│ attemptCount (Int)              │       │ createdAt (Timestamp, Index)    │
│ lastResponseCode (Int, Nullable)│       └─────────────────────────────────┘
│ createdAt (Timestamp, Index)    │
│ updatedAt (Timestamp)           │
└─────────────────────────────────┘
```

---

## 8. Queue and Worker Architecture

- **BullMQ on Redis:** Provides atomic distributed locking, delayed job scheduling, and automatic stalled-job recovery.
- **Unique Retry Job IDs:** Retries use suffixed IDs (`${jobId}:r${attempt}`) to avoid Redis duplicate key rejections while maintaining a stable client-facing `jobId`.
- **Worker Modes:**
  - **Standalone Mode:** Set `RUN_WORKER_IN_PROCESS=false` to run dedicated worker containers.
  - **Embedded Mode:** Set `RUN_WORKER_IN_PROCESS=true` to run API and Worker inside a single Node.js process (ideal for Render free tier).

---

## 9. Retry Mechanism & Exponential Backoff

| Attempt | Phase | Delay Gap | Total Elapsed | Action on 5xx / 429 / Timeout |
|:---:|:---:|:---:|:---:|---|
| **1** | Initial Delivery | 0s | 0s | On failure, schedule Retry 1 with 2s delay |
| **2** | Retry 1 | ~2.0s | ~2.0s | On failure, schedule Retry 2 with 4s delay |
| **3** | Retry 2 | ~4.0s | ~6.0s | On failure, schedule Retry 3 with 8s delay |
| **4** | Retry 3 (Final) | ~8.0s | ~14.0s | On failure, mark event permanently as `FAILED` |

- **429 `Retry-After` Header:** If downstream returns `HTTP 429` with a numeric `Retry-After` header (e.g. `2`), the worker respects that exact delay (bounded up to 30s).
- **Non-Retryable Errors:** Permanent 4xx client errors (e.g. 400 Bad Request, 404 Not Found) and SSRF security rejections fail immediately on Attempt 1.

---

## 10. Per-Domain Rate Limiting Mechanism

- **Sliding-Window Algorithm:** Utilizes Redis Sorted Sets (`ZSET`). Every outbound request executes an atomic Lua script:
  1. Purges entries older than `now - 1000ms`.
  2. Counts active requests in the current window.
  3. If count < 10: adds timestamp to ZSET and allows request.
  4. If count >= 10: calculates remaining delay until the oldest entry expires and defers the job.
- **Fail-Open Policy:** If Redis rate-limiter encounters an internal error, the check fails open to prevent system-wide delivery starvation.

---

## 11. API Endpoints

| Method | Endpoint | Description | Expected Status |
|---|---|---|---|
| `POST` | `/api/webhooks/dispatch` | Ingest and enqueue a webhook | `202 Accepted` |
| `GET` | `/api/webhooks` | List latest 20 webhook events | `200 OK` |
| `GET` | `/api/webhooks/:jobId` | Retrieve status & metadata for a job | `200 OK` / `404` |
| `GET` | `/api/webhooks/:jobId/attempts` | Chronological delivery attempts | `200 OK` / `404` |
| `GET` | `/health` | Service health (API, DB, Redis) | `200 OK` / `503` |
| `GET` | `/docs` | OpenAPI / Swagger UI | `200 OK` |
| `POST/GET`| `/mock/ok` | Mock 200 OK receiver | `200 OK` |
| `POST/GET`| `/mock/fail` | Mock 500 error receiver | `500 Error` |
| `POST/GET`| `/mock/flaky` | Mock flaky receiver (fails 2x, then 200) | `500` / `200` |
| `POST/GET`| `/mock/slow` | Mock slow receiver (delays 10s) | `200 OK` |
| `POST/GET`| `/mock/ratelimit` | Mock 429 receiver (`Retry-After: 2`) | `429 RateLimit` |

---

## 12. Request & Response Examples

### Webhook Ingestion Request:
```bash
curl -X POST http://localhost:3000/api/webhooks/dispatch \
  -H "Content-Type: application/json" \
  -d '{
    "destinationUrl": "https://httpbin.org/post",
    "eventId": "evt_order_9876",
    "payload": {
      "event": "order.created",
      "orderId": "ord_5521",
      "amount": 149.99
    }
  }'
```

### Ingestion Response (HTTP 202 Accepted):
```json
{
  "status": "queued",
  "jobId": "job_e6b360f0-327c-40da-9e4a-9b480c5ba8cb",
  "eventId": "evt_order_9876"
}
```

### Job Status Response (`GET /api/webhooks/job_e6b360f0-327c-40da-9e4a-9b480c5ba8cb`):
```json
{
  "jobId": "job_e6b360f0-327c-40da-9e4a-9b480c5ba8cb",
  "eventId": "evt_order_9876",
  "destinationDomain": "httpbin.org",
  "status": "DELIVERED",
  "attemptCount": 1,
  "lastResponseCode": 200,
  "createdAt": "2026-11-04T18:00:00.000Z",
  "updatedAt": "2026-11-04T18:00:00.050Z"
}
```

---

## 13. Sample Quickstart curl Commands

```bash
export BASE="http://localhost:3000"

# 1. Clean 200 OK Delivery
curl -s -X POST "$BASE/api/webhooks/dispatch" \
  -H "Content-Type: application/json" \
  -d '{"destinationUrl":"'"$BASE"'/mock/ok","eventId":"evt_demo_1","payload":{"type":"test"}}'

# 2. Check Attempts History
curl -s "$BASE/api/webhooks/<JOB_ID>/attempts"

# 3. Flaky Receiver Test (Recovers on attempt 3)
curl -s -X POST "$BASE/api/webhooks/dispatch" \
  -H "Content-Type: application/json" \
  -d '{"destinationUrl":"'"$BASE"'/mock/flaky?key=test_flaky","eventId":"evt_demo_2","payload":{"type":"flaky"}}'

# 4. Non-blocking Slow Test (10s downstream delay)
curl -s -w "\nIngestion Duration: %{time_total}s\n" -X POST "$BASE/api/webhooks/dispatch" \
  -H "Content-Type: application/json" \
  -d '{"destinationUrl":"'"$BASE"'/mock/slow","eventId":"evt_demo_3","payload":{"type":"slow"}}'
```

---

## 14. Local Installation

```bash
# 1. Clone repository and install dependencies
npm install
npm --prefix frontend install

# 2. Setup environment file
cp .env.example .env

# 3. Run database migrations and generate Prisma client
npx prisma migrate deploy
npx prisma generate

# 4. Build application
npm run build:all

# 5. Start development servers
npm run dev
```

---

## 15. Docker Setup

Spin up PostgreSQL, Redis, API, and the BullMQ Worker in isolated containers:

```bash
# Build and start all 4 containers in the background
docker compose up --build -d

# View service logs
docker compose logs -f

# Verify container health
docker compose ps
```

- Web UI & API: `http://localhost:3000`
- Swagger UI: `http://localhost:3000/docs`
- PostgreSQL host port: `5434`
- Redis host port: `6381`

To stop services:
```bash
docker compose down
```

---

## 16. Environment Variables

| Variable | Default | Description |
|---|---|---|
| `NODE_ENV` | `development` | Environment mode (`development`, `test`, `production`) |
| `PORT` | `3000` | Port for the Express server |
| `DATABASE_URL` | — | PostgreSQL connection string (`postgresql://...`) |
| `REDIS_URL` | — | Redis connection URL (`redis://...` or TLS `rediss://...`) |
| `RUN_WORKER_IN_PROCESS` | `true` in prod, `false` in dev | When `true`, embeds worker inside API web service |
| `CORS_ORIGIN` | `*` | Allowed CORS origins |
| `RATE_LIMIT_MAX_REQUESTS` | `10` | Max requests per destination domain per window |
| `RATE_LIMIT_WINDOW_MS` | `1000` | Rate limit sliding-window duration (ms) |
| `WORKER_CONCURRENCY` | `5` | Concurrent jobs per worker instance |
| `DELIVERY_TIMEOUT_MS` | `10000` | Outbound request timeout (10 seconds) |
| `MAX_RETRIES` | `3` | Maximum retries (total 4 attempts) |
| `ENABLE_SSRF_PROTECTION` | `true` | Validates DNS and blocks private/reserved IPs |
| `ALLOW_PRIVATE_HOSTS` | `false` | Set `true` only for local docker-compose testing |
| `SELF_BASE_URL` | `""` | Public hostname of this app to allow calls to `/mock` |

---

## 17. Testing Instructions

```bash
# Run all unit and integration test suites
npm test

# Run unit tests only
npm run test:unit

# Run API integration tests only
npm run test:integration

# Execute 12-check automated end-to-end verification suite
bash scripts/verify.sh http://localhost:3000
```

---

## 18. Deployment Instructions (Render + Neon + Upstash)

1. **PostgreSQL:** Create a free database on [Neon.tech](https://neon.tech) and copy the pooled URL (`?sslmode=require`).
2. **Redis:** Create a free Redis database on [Upstash.com](https://upstash.com) and copy the TLS URL (`rediss://default:...@...`).
3. **Web Service on Render:**
   - Create a Web Service connected to your repository.
   - **Build Command:** `npm install && npm run build:all && npx prisma migrate deploy`
   - **Start Command:** `npm start`
   - **Environment Variables:**
     - `NODE_ENV`: `production`
     - `PORT`: `10000`
     - `DATABASE_URL`: `<Your Neon connection string>`
     - `REDIS_URL`: `<Your Upstash connection string>`
     - `RUN_WORKER_IN_PROCESS`: `true`
     - `ENABLE_SSRF_PROTECTION`: `true`
     - `ALLOW_PRIVATE_HOSTS`: `false`
     - `SELF_BASE_URL`: `https://<your-app>.onrender.com`

---

## 19. Security Considerations

- **SSRF Defense:** Evaluates destination host against IPv4 and IPv6 private, loopback, and link-local CIDR blocks.
- **Cloud Metadata Defense:** Blocks access to `169.254.169.254` (AWS, GCP, Azure, DigitalOcean metadata service).
- **DNS Rebinding Prevention:** Uses custom `http.Agent`/`https.Agent` with `lookup` pinning so the socket connects to the exact validated IP address.
- **Redirect Disabling:** `maxRedirects: 0` prevents redirect-based bypasses into private internal subnets.

---

## 20. Known Limitations

- **At-Least-Once Delivery:** If a downstream receiver processes a webhook but drops the network connection before replying, the worker retries. Receivers should use the `X-Event-Id` header to deduplicate.
- **Free-Tier Inactivity Sleep:** Free web instances sleep after 15 minutes of inactivity and take ~50 seconds to wake on first request. A ping service like UptimeRobot can keep the instance active.
