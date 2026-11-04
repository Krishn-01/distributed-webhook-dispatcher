# Distributed Webhook Dispatcher Engine

A production-grade, fault-tolerant, high-throughput Distributed Webhook Dispatcher Engine built with **Node.js, TypeScript, Express, BullMQ, Redis, PostgreSQL, and Prisma ORM**.

Designed to ingest internal webhook events at scale, queue them asynchronously without blocking caller API responses, deliver them to external destination servers, handle transient failures with deterministic exponential backoff, enforce strict destination-domain rate limits, and record full delivery attempt telemetry.

---

## 1. Problem Statement

In distributed systems and microservices architectures, applications need to broadcast event notifications to external third-party webhook receivers (e.g., user signup, payment notifications, status updates).

However, external receiver servers present severe reliability challenges:
- **Variable Latency**: Third-party servers may take seconds or hang indefinitely. Synchronous HTTP dispatching ties up caller threads and degrades API responsiveness.
- **Cascading Failures & Outages**: Target servers may be down (HTTP 5xx), return rate-limit errors (HTTP 429), or drop connections.
- **Uncontrolled Flooding**: Rapid-fire bursts to a single client endpoint can overwhelm their infrastructure.
- **Data Loss**: Without persistent tracking and intelligent retries, failed webhooks are lost forever.

This engine solves these challenges through an **asynchronous decoupled architecture**, **atomic Redis sliding-window domain rate limiting**, **SSRF protection**, and **durable PostgreSQL delivery attempt tracking**.

---

## 2. Key Features

- **Lightning-Fast Non-Blocking Ingestion**: Returns `HTTP 202 Accepted` immediately (< 30ms) with `status: "queued"` and `jobId`. Does not wait for downstream HTTP delivery.
- **Strict Idempotency**: Unique constraint on `eventId` prevents duplicate event ingestion or duplicate delivery even if internal services retry ingestion.
- **Independent Asynchronous Workers**: BullMQ worker processes consume jobs independently, decoupled from API web instances.
- **Atomic Destination-Domain Rate Limiting**: Redis Lua script enforces a sliding-window rate limit (default: 10 req/s per destination domain) across multiple worker instances. Rate-limited jobs are deferred back to the queue without recording false delivery failures.
- **Deterministic Exponential Backoff**:
  - Initial attempt: Immediate
  - Retry 1: 2 seconds
  - Retry 2: 4 seconds
  - Retry 3: 8 seconds
  - Maximum total attempts: 4 (initial + 3 retries)
  - Intelligently respects `Retry-After` HTTP headers.
- **Error Classification**:
  - **Retryable**: HTTP 429, HTTP 5xx, timeouts, connection drops (`ECONNREFUSED`, `ENOTFOUND`).
  - **Permanent (No Retry)**: HTTP 4xx (400, 401, 403, 404, etc. except 429) and SSRF violations.
- **SSRF & DNS Security Shield**: Enforces `http:`/`https:` protocols, resolves DNS, blocks private/loopback/cloud metadata subnets (127.0.0.1, 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 169.254.169.254), and disables automated redirects.
- **Durable Delivery Audit Log**: Records every HTTP delivery attempt with attempt number, response code, duration in milliseconds, error message, and timestamps.
- **Interactive Swagger / OpenAPI UI**: Self-documenting API mounted at `/docs`.
- **Docker & Cloud Ready**: Multi-stage `Dockerfile`, `docker-compose.yml`, and `render.yaml` infrastructure blueprint.

---

## 3. Architecture Overview

```
                      +---------------------------------------+
                      |         CLIENT APPLICATION            |
                      +---------------------------------------+
                                          |
                        POST /api/webhooks/dispatch
                                          v
                      +---------------------------------------+
                      |       EXPRESS.JS INGESTION API        |
                      |  - Request Validation (Zod)           |
                      |  - Idempotency Guard (eventId)        |
                      |  - DB Insert (Status: QUEUED)         |
                      |  - BullMQ Queue Push                  |
                      |  - Instant HTTP 202 Accepted (<30ms)  |
                      +---------------------------------------+
                                     /         \
                       Durable State/           \ Enqueue Job
                                   v             v
                    +--------------------+    +--------------------+
                    |  PostgreSQL Store  |    |  BullMQ / Redis    |
                    | (System of Record) |    |  (Delivery Queue)  |
                    +--------------------+    +--------------------+
                                                         |
                                            Job Dequeue  | Delayed Re-enqueue
                                                         v
                      +---------------------------------------+
                      |      BULLMQ BACKGROUND WORKER         |
                      |                                       |
                      |  1. Atomic Redis Lua Rate Limit Check |
                      |     -> Exhausted? Defer job (no fail) |
                      |                                       |
                      |  2. SSRF Protection & DNS Lookup      |
                      |     -> Block private/metadata IPs     |
                      |                                       |
                      |  3. Outbound HTTP Delivery (Axios)    |
                      |     -> Timeout: 10s | Headers attached|
                      |                                       |
                      |  4. Status & Retry Evaluation         |
                      |     -> 2xx: Mark DELIVERED            |
                      |     -> 4xx: Mark FAILED (no retry)    |
                      |     -> 5xx/429/Timeout: Backoff delay |
                      |        (2s, 4s, 8s -> Max 4 attempts) |
                      |                                       |
                      |  5. Persist DeliveryAttempt Record    |
                      +---------------------------------------+
                                          |
                                          v
                      +---------------------------------------+
                      |      EXTERNAL DESTINATION SERVER      |
                      |   (Customer Webhook Target Endpoint)  |
                      +---------------------------------------+
```

---

## 4. Technology Stack

| Component | Technology | Rationale |
|---|---|---|
| **Runtime** | Node.js (v20+ LTS) | Asynchronous non-blocking I/O, event-loop efficiency |
| **Language** | TypeScript (Strict Mode) | Strong type-safety, maintainability, robust interfaces |
| **Web Framework** | Express.js | Lightweight, mature HTTP routing and middleware ecosystem |
| **Queue Engine** | BullMQ | Redis-based distributed queue with atomic delayed jobs |
| **Caching & Queue Store** | Redis (ioredis) | Ultra-fast in-memory queueing and atomic Lua script execution |
| **Database & ORM** | PostgreSQL & Prisma ORM | Relational consistency, migrations, type-safe queries |
| **HTTP Client** | Axios | Configurable timeouts, header handling, custom validation |
| **Validation** | Zod | Runtime type safety and schema validation |
| **Logging** | Pino | High-speed structured JSON logging with request tracing |
| **Testing** | Jest & Supertest | Comprehensive unit and integration test coverage |
| **Documentation** | Swagger / OpenAPI 3.0 | Standardized interactive API documentation |
| **Containerization** | Docker & Docker Compose | Repeatable multi-container deployment |

---

## 5. Directory Structure

```
distributed-webhook-dispatcher/
├── src/
│   ├── app.ts                         # Express application setup & middleware
│   ├── server.ts                      # HTTP server startup & graceful shutdown
│   ├── config/
│   │   ├── env.ts                     # Environment validation via Zod
│   │   ├── database.ts                # PrismaClient singleton & DB healthcheck
│   │   └── redis.ts                   # Redis client factory & connection check
│   ├── modules/
│   │   ├── health/
│   │   │   ├── health.controller.ts   # GET /health implementation
│   │   │   └── health.routes.ts       # Health router
│   │   └── webhooks/
│   │       ├── webhook.controller.ts  # Ingestion & retrieval HTTP handlers
│   │       ├── webhook.routes.ts      # Express routes (/dispatch, /:jobId, /:jobId/attempts)
│   │       ├── webhook.service.ts     # Business logic & idempotency orchestration
│   │       ├── webhook.repository.ts  # Prisma database access layer
│   │       ├── webhook.schema.ts      # Zod input validation schemas
│   │       └── webhook.types.ts       # TypeScript domain models & interfaces
│   ├── queue/
│   │   ├── queue.connection.ts        # BullMQ shared Redis connection manager
│   │   └── webhook.queue.ts           # BullMQ queue definition & job producer
│   ├── workers/
│   │   └── webhook.worker.ts          # Standalone BullMQ worker process
│   ├── services/
│   │   ├── delivery.service.ts        # Outbound HTTP POST delivery with telemetry
│   │   ├── retry.service.ts           # Exponential backoff & failure classification
│   │   └── rate-limiter.service.ts    # Redis Lua sliding-window rate limiter
│   ├── middleware/
│   │   ├── error.middleware.ts        # Central error handler & formatting
│   │   ├── not-found.middleware.ts    # 404 handler
│   │   └── request-id.middleware.ts   # X-Request-Id header propagation
│   ├── utils/
│   │   ├── app-error.ts               # Standardized application error classes
│   │   ├── domain.ts                  # URL domain extractor & normalizer
│   │   ├── logger.ts                  # Pino structured logger
│   │   └── ssrf.ts                    # SSRF protection & private IP filter
│   └── docs/
│       └── swagger.ts                 # OpenAPI 3.0 specification & Swagger UI
├── prisma/
│   └── schema.prisma                  # PostgreSQL models (WebhookEvent, DeliveryAttempt)
├── tests/
│   ├── unit/
│   │   ├── domain.test.ts             # Domain normalization unit tests
│   │   ├── ssrf.test.ts               # SSRF & IP validator unit tests
│   │   ├── retry.service.test.ts      # Backoff & failure evaluation tests
│   │   ├── delivery.service.test.ts   # Outbound HTTP delivery tests
│   │   └── rate-limiter.service.test.ts # Redis sliding window rate limiter tests
│   └── integration/
│       ├── webhook.api.test.ts        # End-to-end API integration tests
│       └── worker.processing.test.ts  # Worker execution & retry flow tests
├── docs/
│   ├── REQUIREMENTS.md                # Traceable requirements checklist
│   └── ARCHITECTURE.md                # System design & distributed workflows
├── Dockerfile                         # Production multi-stage Docker build
├── docker-compose.yml                 # Full stack Compose (API, Worker, Postgres, Redis)
├── render.yaml                        # Render Cloud deployment blueprint
├── Procfile                           # Process manager file
├── postman_collection.json            # 1-Click Postman test collection
├── tsconfig.json                      # TypeScript configuration
├── package.json
└── README.md
```

---

## 6. Installation & Local Setup

### Prerequisites
- **Node.js**: v20+ LTS
- **PostgreSQL**: v14+
- **Redis**: v6+

### 1. Clone & Install Dependencies
```bash
git clone https://github.com/your-username/distributed-webhook-dispatcher.git
cd distributed-webhook-dispatcher
npm install
```

### 2. Environment Configuration
Copy `.env.example` to `.env` and configure your credentials:
```bash
cp .env.example .env
```

Example `.env`:
```env
PORT=3000
NODE_ENV=development
LOG_LEVEL=info

# PostgreSQL
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/webhook_dispatcher?schema=public"

# Redis
REDIS_URL="redis://localhost:6379"

# Outbound Rate Limiting (per destination domain)
RATE_LIMIT_MAX_REQUESTS=10
RATE_LIMIT_WINDOW_MS=1000

# Worker & Delivery
WORKER_CONCURRENCY=5
DELIVERY_TIMEOUT_MS=10000
MAX_RETRIES=3
ENABLE_SSRF_PROTECTION=true
```

### 3. Database Migration
Apply Prisma schema to your PostgreSQL database:
```bash
npx prisma db push
```

### 4. Running the Application

In development, run the API and Worker in separate terminal windows:

**Terminal 1 (Express API Server):**
```bash
npm run dev
```

**Terminal 2 (BullMQ Background Worker):**
```bash
npm run dev:worker
```

The API will be available at `http://localhost:3000`.
Interactive Swagger UI is available at `http://localhost:3000/docs`.

---

## 7. Running with Docker Compose

To spin up the entire cluster (API, Worker, PostgreSQL, Redis) with a single command:

```bash
docker-compose up --build
```

This will automatically:
1. Start PostgreSQL with a persistent health check.
2. Start Redis with a health check.
3. Apply database schemas.
4. Launch the Express Ingestion API on `http://localhost:3000`.
5. Launch the independent BullMQ worker listening to the Redis queue.

To tear down:
```bash
docker-compose down -v
```

---

## 8. API Documentation & Testing

### Interactive Swagger UI
Open `http://localhost:3000/docs` in your browser.
OpenAPI JSON schema: `http://localhost:3000/docs.json`.

---

### Endpoint Reference

#### 1. Ingest Webhook Event
`POST /api/webhooks/dispatch`

**Headers:**
`Content-Type: application/json`

**Request Body:**
```json
{
  "destinationUrl": "https://webhook.site/YOUR_UUID",
  "eventId": "evt_order_1001",
  "payload": {
    "event": "order.completed",
    "orderId": "ord_999",
    "amount": 149.99,
    "currency": "USD"
  }
}
```

**cURL Example:**
```bash
curl -X POST http://localhost:3000/api/webhooks/dispatch \
  -H "Content-Type: application/json" \
  -d '{
    "destinationUrl": "https://webhook.site/b928c05e-8848-4cb5-888d-56d11a2f6460",
    "eventId": "evt_test_001",
    "payload": {
      "event": "user.signup",
      "userId": "usr_789"
    }
  }'
```

**Response (`202 Accepted`):**
```json
{
  "status": "queued",
  "jobId": "job_01524e93-6c84-486d-8b01-e28a554a938c",
  "eventId": "evt_test_001"
}
```

---

#### 2. Get Webhook Job Status
`GET /api/webhooks/:jobId`

**cURL Example:**
```bash
curl http://localhost:3000/api/webhooks/job_01524e93-6c84-486d-8b01-e28a554a938c
```

**Response (`200 OK`):**
```json
{
  "jobId": "job_01524e93-6c84-486d-8b01-e28a554a938c",
  "eventId": "evt_test_001",
  "destinationDomain": "webhook.site",
  "status": "DELIVERED",
  "attemptCount": 1,
  "lastResponseCode": 200,
  "createdAt": "2026-11-04T08:50:00.000Z",
  "updatedAt": "2026-11-04T08:50:00.250Z"
}
```

---

#### 3. Get Delivery Attempt History
`GET /api/webhooks/:jobId/attempts`

**cURL Example:**
```bash
curl http://localhost:3000/api/webhooks/job_01524e93-6c84-486d-8b01-e28a554a938c/attempts
```

**Response (`200 OK`):**
```json
{
  "jobId": "job_01524e93-6c84-486d-8b01-e28a554a938c",
  "attempts": [
    {
      "attemptNumber": 1,
      "status": "RETRYING",
      "responseCode": 500,
      "errorMessage": "HTTP 500: Internal Server Error",
      "durationMs": 88,
      "createdAt": "2026-11-04T08:50:00.120Z"
    },
    {
      "attemptNumber": 2,
      "status": "SUCCESS",
      "responseCode": 200,
      "errorMessage": null,
      "durationMs": 42,
      "createdAt": "2026-11-04T08:50:02.162Z"
    }
  ]
}
```

---

#### 4. Health Check
`GET /health`

**cURL Example:**
```bash
curl http://localhost:3000/health
```

**Response (`200 OK`):**
```json
{
  "status": "healthy",
  "timestamp": "2026-11-04T08:50:00.000Z",
  "services": {
    "api": "up",
    "database": "connected",
    "redis": "connected"
  }
}
```

---

## 9. Rate Limiting Architecture

Unlike inbound API rate limiting (which protects the dispatcher from clients), outbound rate limiting **protects client destination domains from being flooded**.

### Algorithm: Atomic Redis Sliding-Window Log
1. **Domain Extraction**: Every destination URL is normalized to its lower-case hostname (e.g. `https://api.merchant.com:8443/webhook` -> `api.merchant.com`).
2. **Redis Lua Script Execution**:
   - Maintains a Redis Sorted Set (`ZSET`) at `ratelimit:domain:{domain}`.
   - Trims all timestamp members older than `now - windowMs`.
   - Counts active requests in the sliding window.
   - If count `< limit`: adds the current timestamp, refreshes TTL, and grants execution (`allowed: true`).
   - If count `>= limit`: reads the oldest score in the window, calculates the exact millisecond delay until capacity clears (`retryAfterMs`), and returns `allowed: false`.
3. **Deferral Without Penalty**:
   - When a job is deferred, BullMQ re-enqueues the job with `delay: retryAfterMs`.
   - **Crucial**: No failed delivery attempt is recorded in PostgreSQL, and `attemptCount` is not incremented.

---

## 10. Retry Mechanism & Backoff Schedule

When a delivery attempt fails, the engine classifies the failure:

| Error Type | Status Code / Error | Action | Backoff Delay |
|---|---|---|---|
| **Server Error** | 500, 502, 503, 504 | Retry | $2000 \times 2^{\text{attempt}-1}\text{ ms}$ |
| **Rate Limited** | 429 Too Many Requests | Retry | Calculated Backoff or bounded `Retry-After` |
| **Network Failure** | `ECONNREFUSED`, `ENOTFOUND` | Retry | Calculated Backoff |
| **Timeout** | `ETIMEDOUT`, 10s exceeded | Retry | Calculated Backoff |
| **Client Error** | 400, 401, 403, 404, 422 | Permanent Failure | **No Retry** |
| **SSRF Violation** | Private / Loopback IP | Permanent Failure | **No Retry** |

### Schedule:
- **Attempt 1**: Immediate upon pickup
- **Attempt 2 (Retry 1)**: 2,000 ms (2 seconds)
- **Attempt 3 (Retry 2)**: 4,000 ms (4 seconds)
- **Attempt 4 (Retry 3)**: 8,000 ms (8 seconds)
- **Exhaustion**: After 4 total attempts, the event status permanently transitions to `FAILED`.

---

## 11. Security & SSRF Protection

To prevent attackers from using the webhook engine to scan internal infrastructure or access cloud metadata services:
1. **Protocol Validation**: Rejects any scheme other than `http:` or `https:`.
2. **DNS & IP Filtering**: Before socket connection, resolves the target host and validates against banned subnets:
   - Loopback: `127.0.0.0/8`, `::1`
   - RFC 1918 Private: `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`
   - Link-Local & Cloud Metadata: `169.254.0.0/16` (including `169.254.169.254`)
   - Metadata Hostnames: `metadata.google.internal`, `instance-data`
3. **Redirect Disabling**: `maxRedirects: 0` prevents open-redirect SSRF bypasses.

---

## 12. Automated Testing

The project includes unit and integration tests covering all core system requirements:

```bash
# Run all tests
npm test

# Run unit tests only
npm run test:unit

# Run integration tests only
npm run test:integration
```

### Coverage Highlights:
- **50 Automated Tests across 7 Test Suites** (100% passing).
- Valid / invalid payload validation & HTTP 202 immediate response time benchmark.
- Idempotency and duplicate event suppression.
- HTTP 500, 502, 503, 504, 429 exponential backoff retries.
- Request timeout and network connection failure recovery.
- Permanent HTTP 400 rejection without retry.
- Retry exhaustion at 4 attempts.
- Redis Lua sliding-window rate limit deferral without attempt penalization.
- SSRF protection across IPv4 and IPv6 subnets.
- Full delivery attempt history persistence.

---

## 13. Production Deployment Guide

### Deploying to Render

This repository includes a native [`render.yaml`](file:///./render.yaml) blueprint:

1. Create a free account on [Render.com](https://render.com).
2. Create a Managed PostgreSQL Database (named `webhook-postgres`).
3. Create a Managed Redis Instance (via Upstash or Render Redis).
4. Connect this GitHub repository and select **New Blueprint Instance**.
5. Render will automatically launch:
   - **Web Service (`webhook-dispatcher-api`)**: Ingestion API with auto-scaling and `/health` health check.
   - **Background Worker (`webhook-dispatcher-worker`)**: Dedicated BullMQ worker process.
6. Trigger live webhooks and inspect delivery attempts via the public URL.

---

## 14. Architectural Decisions & Trade-Offs

1. **Why BullMQ over simple database polling?**
   - Polling a relational database with `SELECT ... FOR UPDATE SKIP LOCKED` introduces database contention under high concurrency. BullMQ uses Redis memory structures, offering sub-millisecond job scheduling, delayed retries, and high throughput.
2. **Why separate API and Worker processes?**
   - Outbound HTTP requests can experience network latency or slow responses. Running workers separately from API web processes ensures that slow outbound requests never starve the ingestion event loop.
3. **Why Sliding-Window over Fixed Window for Rate Limiting?**
   - Fixed-window counters allow $2 \times$ bursts near boundary resets (e.g., 10 requests at second 0.99 and 10 requests at second 1.01). Sliding-window tracking via Redis Sorted Sets guarantees smooth traffic shaping with zero boundary spikes.
4. **Idempotency Strategy**:
   - Enforcing unique constraints on `eventId` at both the database and ingestion layer prevents duplicate deliveries if the upstream client retries an ingestion request.

---

## 15. Technical Interview Quick Reference

When reviewing or discussing this project during a technical interview:
- **Ingestion Latency**: Handled asynchronously; the caller is unblocked immediately upon database persistence and queue enqueue (< 30ms).
- **Delivery Guarantee**: At-least-once delivery with idempotency guards.
- **SSRF Hardening**: Validates both IP and resolved hostname, avoiding blind HTTP requests to internal networks or cloud metadata endpoints.
- **Rate Limit Mechanism**: Destination-domain rate limiting via atomic Redis Lua scripts (`ratelimit:domain:{domain}`). Rate-limited jobs are delayed in BullMQ without incrementing attempt count or recording fake failed attempts.
- **Retry Strategy**: Exponential backoff $2000 \times 2^{n-1}\text{ ms}$ for $n \in \{1, 2, 3\}$, bounded at 4 total attempts. Non-retryable errors (HTTP 4xx except 429) fail immediately.
