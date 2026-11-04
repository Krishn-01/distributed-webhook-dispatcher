# Traceable Requirements Checklist & Verification Matrix

This document maps all original requirements from the assignment PDF and the engineering specification directly to their planned implementation, source code location, verification method, and status.

## 1. Assignment Summary
- **Source**: Backend Developer Intern Take-Home: Distributed Webhook Dispatcher (PDF, 2 pages)
- **Time Limit**: 48 Hours
- **Core Mission**: Build a Distributed Webhook Dispatcher Engine that accepts internal events, queues them asynchronously, handles retries with exponential backoff, respects strict per-domain rate limits, and persists delivery history.

---

## 2. Requirements Traceability Matrix

| ID | Category | Original Requirement (PDF & Spec) | Planned Implementation | Source Files | Verification Method | Status |
|---|---|---|---|---|---|---|
| **REQ-01** | Ingestion | `POST /api/webhooks/dispatch` accepts `{ destinationUrl, eventId, payload }` | Zod schema validation (`webhook.schema.ts`), controller & service | `src/modules/webhooks/webhook.*.ts` | Supertest integration tests with valid/invalid JSON payloads | Pending |
| **REQ-02** | Ingestion | Non-blocking API: Validate, persist event, enqueue job, return HTTP 202 `{ "status": "queued", "jobId": "..." }` instantly | Store in Postgres with initial status `QUEUED`, enqueue in BullMQ, return 202 before any delivery attempt | `src/modules/webhooks/webhook.service.ts`, `src/queue/webhook.queue.ts` | Benchmark test: Response time < 50ms even if target URL takes 10s | Pending |
| **REQ-03** | Ingestion | Idempotency on `eventId` | Unique constraint on `eventId` in Postgres. Duplicate submission returns existing jobId without double enqueueing | `prisma/schema.prisma`, `webhook.service.ts` | Unit/integration test: sending same `eventId` twice | Pending |
| **REQ-04** | Ingestion | URL Validation & Protocol check | Enforce `http:` / `https:` protocols only. Reject non-HTTP schemas | `src/modules/webhooks/webhook.schema.ts`, `src/utils/ssrf.ts` | Schema unit tests for invalid protocols (`ftp://`, `file://`) | Pending |
| **REQ-05** | Security | SSRF Protection & DNS Rebinding | Validate destination IP after DNS resolution to block private/loopback/cloud metadata (127.0.0.1, 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 169.254.169.254, AWS/GCP metadata) and pin IP or custom HTTP agent | `src/utils/ssrf.ts`, `src/services/delivery.service.ts` | Unit test with loopback, private IPs, and metadata hostnames | Pending |
| **REQ-06** | Worker | Independent asynchronous background worker | Standalone BullMQ Worker process (`src/workers/webhook.worker.ts`) decoupled from Express API | `src/workers/webhook.worker.ts` | Start API and Worker in separate processes via npm scripts | Pending |
| **REQ-07** | Worker | Outbound HTTP POST delivery | Axios HTTP client sending `payload` with standard headers (`Content-Type: application/json`, `User-Agent`, `X-Webhook-Event-Id`, `X-Delivery-Attempt`) | `src/services/delivery.service.ts` | Integration test against local mock HTTP receiver | Pending |
| **REQ-08** | Retry | Exponential Backoff schedule: 3 retries max (total 4 attempts) at 2s, 4s, 8s | BullMQ delayed backoff or worker re-enqueue calculation (`2000 * 2^(attempt - 1)` ms) | `src/services/retry.service.ts`, `src/workers/webhook.worker.ts` | Unit & integration tests simulating failure progression | Pending |
| **REQ-09** | Retry | Retryable Failures: HTTP 5xx, HTTP 429, timeouts, network/connection errors | Classification utility in `retry.service.ts` identifying retryable vs permanent errors | `src/services/retry.service.ts` | Integration tests with 500, 502, 503, 504, 429, ECONNREFUSED, ETIMEDOUT | Pending |
| **REQ-10** | Retry | Non-retryable Failures: Permanent HTTP 4xx (400, 401, 403, 404, etc. except 429) | Abort retries immediately, mark event `FAILED` and record attempt | `src/services/retry.service.ts` | Test HTTP 400 Bad Request triggers 1 attempt and final `FAILED` status | Pending |
| **REQ-11** | Logging | Delivery history & attempt persistence | Store each attempt in `DeliveryAttempt` table (attemptNumber, status, responseCode, errorMessage, durationMs, createdAt) | `prisma/schema.prisma`, `webhook.repository.ts` | Query attempts API endpoint after delivery | Pending |
| **REQ-12** | Rate Limiting | Destination-domain rate limiting (Token-bucket / sliding window) | Redis-backed sliding window or token bucket per domain using atomic Lua script. Multi-worker safe | `src/services/rate-limiter.service.ts` | Concurrent worker test hitting the same domain; verify rate cap and job deferral | Pending |
| **REQ-13** | Rate Limiting | Rate-limit job deferral (No busy-wait, no false failure) | When rate limit exceeded, delay/reschedule BullMQ job; do not log as a failed delivery attempt | `src/workers/webhook.worker.ts`, `rate-limiter.service.ts` | Verify queue delay without incrementing `attemptCount` | Pending |
| **REQ-14** | API Endpoints | `GET /api/webhooks/:jobId` | Return event metadata: jobId, eventId, destinationDomain, status, attemptCount, lastResponseCode, timestamps | `src/modules/webhooks/webhook.controller.ts` | Integration test verifying JSON response | Pending |
| **REQ-15** | API Endpoints | `GET /api/webhooks/:jobId/attempts` | Return chronological attempt log: attemptNumber, status, responseCode, errorMessage, durationMs, createdAt | `src/modules/webhooks/webhook.controller.ts` | Integration test asserting array of attempts | Pending |
| **REQ-16** | API Endpoints | `GET /health` | Healthcheck verifying API, PostgreSQL connectivity, and Redis connectivity | `src/modules/health/health.controller.ts` | Integration test for 200 OK with Postgres & Redis status | Pending |
| **REQ-17** | Docs | Swagger / OpenAPI UI | Interactive documentation mounted at `/docs` | `src/docs/swagger.ts` | Browser / HTTP GET `/docs` test | Pending |
| **REQ-18** | Tests | Comprehensive Automated Tests (Jest + Supertest) | 17 mandated test scenarios (validation, 202, success, 500 retry, 429 retry, timeout, 400 failure, rate limiting, etc.) | `tests/unit/*.test.ts`, `tests/integration/*.test.ts` | `npm test` passing with 100% assertions | Pending |
| **REQ-19** | Docker | Multi-container setup (Docker & Docker Compose) | Containerized API, Worker, PostgreSQL, Redis | `Dockerfile`, `docker-compose.yml` | `docker-compose up --build` verification | Pending |
| **REQ-20** | Deployment | Live Deployment on Render / Cloud host | Production deployment with live URL, README with curl examples | `render.yaml`, `README.md` | Real public HTTP request testing | Pending |

---

## 3. Evaluation Criteria Cross-Reference
- **Non-blocking Architecture**: Verified via asynchronous BullMQ queue; ingestion controller immediately responds with 202 Accepted.
- **Deployment Realism**: Verified with Docker Compose locally and ready-to-deploy configuration for Render/Railway with healthchecks and independent worker.
- **Code Clarity & Architecture**: Clean modular architecture, TypeScript strict mode, comprehensive `README.md` and `ARCHITECTURE.md`.

