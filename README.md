# Distributed Webhook Dispatcher

**An asynchronous, reliable, and scalable webhook delivery system built with Node.js, TypeScript, BullMQ, Redis, PostgreSQL, and React.**

<p align="center">

[![Node.js](https://img.shields.io/badge/Node.js-22%2B-green?logo=node.js)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Redis](https://img.shields.io/badge/Redis-BullMQ-red?logo=redis)](https://redis.io/)
[![PostgreSQL](https://img.shields.io/badge/Database-PostgreSQL-blue?logo=postgresql)](https://www.postgresql.org/)
[![Docker](https://img.shields.io/badge/Container-Docker-blue?logo=docker)](https://www.docker.com/)

</p>

---

## 🚀 Live Project Links

<p align="center">

### 🌐 [LIVE DEMO — OPEN DASHBOARD](https://distributed-webhook-dispatcher-lgob.onrender.com)

Explore the deployed application and interact with the webhook management dashboard.

</p>

| Resource | Description | Link |
|---|---|---|
| 🌐 Live Demo | Production Dashboard | [Open Live Demo](https://distributed-webhook-dispatcher-lgob.onrender.com) |
| ⚡ API Base URL | Production API Server | [Open API](https://distributed-webhook-dispatcher-lgob.onrender.com) |
| 📘 Swagger Documentation | Explore and test API endpoints | [Open Swagger UI](https://distributed-webhook-dispatcher-lgob.onrender.com/docs) |
| ❤️ Health Check | Check application availability | [Check API Health](https://distributed-webhook-dispatcher-lgob.onrender.com/health) |
| 💻 GitHub Repository | Source code and project files | [View on GitHub](https://github.com/Krishn-01/distributed-webhook-dispatcher) |

**Quick Start for Reviewers**

1. Open the [Live Dashboard](https://distributed-webhook-dispatcher-lgob.onrender.com) to explore the application.
2. Visit [Swagger Documentation](https://distributed-webhook-dispatcher-lgob.onrender.com/docs) to explore and test API endpoints.
3. Check the [Health Endpoint](https://distributed-webhook-dispatcher-lgob.onrender.com/health) to verify application availability.
4. Visit the [GitHub Repository](https://github.com/Krishn-01/distributed-webhook-dispatcher) to review the source code.

<sub>Note: The application is hosted on Render's free-tier infrastructure. The first request after an idle period may take some time while the service starts.</sub>

---

## Overview

Distributed Webhook Dispatcher is a backend system designed to deliver webhooks reliably without making the client wait for the destination server.

Instead of sending HTTP requests directly, the system places webhook events into a background queue. Dedicated workers process these events, handle failures, retry unsuccessful deliveries, and maintain delivery records.

The project also includes a React-based dashboard for submitting webhook events and monitoring delivery activity in real time.

## Problem Statement

Traditional webhook implementations can encounter several challenges:

- Slow destination servers can delay API responses.
- Temporary failures can result in unsuccessful event deliveries.
- Repeated requests can overwhelm downstream services.
- Tracking delivery attempts and failures can be difficult.
- Synchronous processing can affect application responsiveness.

**Solution:** An asynchronous, queue-based architecture with background processing, automatic retries, exponential backoff, rate limiting, persistent storage, and delivery monitoring.

## Key Features

- **Asynchronous Processing:** Immediately acknowledges incoming webhook requests with `202 Accepted`.
- **Background Workers:** Processes webhook deliveries independently using BullMQ.
- **Automatic Retries:** Retries failed requests using exponential backoff (2s, 4s, and 8s).
- **Delivery Tracking:** Stores webhook events and delivery attempts in PostgreSQL.
- **Rate Limiting:** Controls request frequency per destination domain using Redis.
- **Idempotency:** Prevents duplicate event processing using unique event IDs.
- **SSRF Protection:** Validates destination URLs and protects against private IP and DNS rebinding attacks.
- **Failure Handling:** Handles HTTP errors, network failures, and request timeouts.
- **Developer Dashboard:** Provides an interface to submit and monitor webhook events.
- **Docker Support:** Runs the application and its infrastructure using Docker Compose.

## Architecture

```mermaid
flowchart TD
    A[Client / React Dashboard] --> B[Express API]
    B --> C[Request Validation]
    C --> D[(PostgreSQL)]
    C --> E[Redis / BullMQ Queue]
    B --> F[202 Accepted Response]

    E --> G[Background Worker]
    G --> H[Domain Rate Limiter]
    H --> I[SSRF Validation]
    I --> J[Destination Server]

    J --> K{Delivery Result}
    K -->|Success| L[Mark Delivered]
    K -->|Retryable Failure| M[Exponential Backoff]
    M --> E
    K -->|Permanent Failure| N[Mark Failed]

    L --> D
    N --> D
    G --> D
```

## How It Works

1. A client sends a webhook request to the API.
2. The API validates the incoming request and checks event uniqueness.
3. The event is stored in PostgreSQL.
4. A background job is added to the BullMQ queue.
5. The API immediately returns `202 Accepted` with a job ID.
6. A background worker picks up the queued job.
7. Redis-based rate limiting and destination security checks are performed.
8. The worker sends an HTTP POST request to the destination.
9. Delivery attempts and response details are stored in PostgreSQL.
10. Failed requests are retried according to the configured retry policy.

## Technology Stack

| Category | Technologies |
|---|---|
| Backend | Node.js, Express.js, TypeScript |
| Frontend | React, Vite, Tailwind CSS |
| Database | PostgreSQL, Prisma ORM |
| Queue | BullMQ, Redis |
| HTTP Client | Axios |
| Validation | Zod |
| API Documentation | Swagger / OpenAPI |
| Testing | Jest, Supertest |
| Infrastructure | Docker, Docker Compose |
| Deployment | Render |

## Project Structure

```text
distributed-webhook-dispatcher/
│
├── frontend/                  # React dashboard
├── prisma/                    # Database schema and migrations
├── docs/                      # Architecture documentation
├── scripts/                   # Verification scripts
│
├── src/
│   ├── config/                # Application configuration
│   ├── modules/
│   │   ├── webhooks/          # Webhook API and business logic
│   │   └── mock/              # Mock destination endpoints
│   ├── queue/                 # BullMQ queue configuration
│   ├── services/              # Delivery and retry services
│   ├── utils/                 # Utility and security functions
│   ├── workers/               # Background workers
│   ├── app.ts
│   └── server.ts
│
├── tests/                     # Unit and integration tests
├── Dockerfile
├── docker-compose.yml
├── postman_collection.json
├── package.json
└── README.md
```

## Getting Started

### Prerequisites

Make sure you have installed:

- Node.js 22 or later
- npm
- Docker Desktop
- Git

### 1. Clone the Repository

```bash
git clone https://github.com/Krishn-01/distributed-webhook-dispatcher.git

cd distributed-webhook-dispatcher
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

Create your local environment file.

**Windows PowerShell:**

```powershell
Copy-Item .env.example .env
```

Update the database and Redis configuration if required.

Never commit your actual `.env` file or expose production credentials.

### 4. Start the Application

Start PostgreSQL, Redis, API, and the background worker:

```bash
docker compose up --build -d
```

Check the running containers:

```bash
docker compose ps
```

### 5. Access the Application

| Service | URL |
|---|---|
| Dashboard | http://localhost:3000 |
| API | http://localhost:3000 |
| Swagger Documentation | http://localhost:3000/docs |
| Health Check | http://localhost:3000/health |

## API Endpoints

**Production Base URL:**

```text
https://distributed-webhook-dispatcher-lgob.onrender.com
```

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/webhooks/dispatch` | Submit a webhook |
| GET | `/api/webhooks` | List webhook events |
| GET | `/api/webhooks/:jobId` | Get webhook status |
| GET | `/api/webhooks/:jobId/attempts` | Get delivery attempts |
| GET | `/health` | Check application health |
| GET | `/docs` | API documentation |

### Submit a Webhook

**Request:**

```http
POST /api/webhooks/dispatch
Content-Type: application/json
```

**Request Body:**

```json
{
  "destinationUrl": "https://httpbin.org/post",
  "eventId": "evt_123456",
  "payload": {
    "event": "user.signup",
    "userId": "usr_999"
  }
}
```

**Expected Response:**

```json
{
  "status": "queued",
  "jobId": "generated-job-id",
  "eventId": "evt_123456"
}
```

The API returns `202 Accepted` without waiting for the destination server to complete delivery.

### Example cURL Request

```bash
curl -X POST https://distributed-webhook-dispatcher-lgob.onrender.com/api/webhooks/dispatch \
-H "Content-Type: application/json" \
-d '{
  "destinationUrl": "https://distributed-webhook-dispatcher-lgob.onrender.com/mock/ok",
  "eventId": "evt_123456",
  "payload": {
    "event": "user.signup",
    "userId": "usr_999"
  }
}'
```

## Retry Mechanism

The background worker automatically retries temporary delivery failures.

| Attempt | Delay |
|---|---:|
| Initial Request | Immediate |
| Retry 1 | 2 seconds |
| Retry 2 | 4 seconds |
| Retry 3 | 8 seconds |

**Maximum delivery attempts: 4 (1 initial attempt + 3 retries).**

Retryable failures include:

- HTTP 5xx responses
- HTTP 429 rate-limit responses
- Request timeouts
- Network errors

Permanent client errors such as HTTP 400 and 404 are not retried.

## Testing

The project includes unit and integration tests.

Run all tests:

```bash
npm test
```

Run unit tests:

```bash
npm run test:unit
```

Run integration tests:

```bash
npm run test:integration
```

Build the project:

```bash
npm run build
```

### Reported Test Results

| Test Category | Passed |
|---|---:|
| Unit Tests | 45 |
| Integration Tests | 26 |
| **Total** | **71** |

<sub>Test counts reflect the previously recorded project results; rerun the test suite to verify the current repository state.</sub>

## Docker Commands

View application logs:

```bash
docker compose logs -f
```

Check container status:

```bash
docker compose ps
```

Stop the containers:

```bash
docker compose down
```

## Security

Security is an important part of the dispatcher.

- Validates destination URLs before making outbound requests.
- Blocks private, loopback, and reserved IP addresses in protected mode.
- Protects against cloud metadata access.
- Uses DNS IP pinning to reduce DNS rebinding risks.
- Disables automatic HTTP redirects to prevent redirect-based SSRF bypasses.

## Deployment

The application is deployed on Render using Docker.

Production infrastructure includes:

- Docker-based application deployment.
- PostgreSQL for persistent storage.
- Redis for BullMQ job processing.
- Prisma migrations during container startup.
- Background worker execution.
- React frontend served by the backend application.

**Production Resources:**

- [Live Dashboard](https://distributed-webhook-dispatcher-lgob.onrender.com)
- [Production API](https://distributed-webhook-dispatcher-lgob.onrender.com)
- [Swagger API Documentation](https://distributed-webhook-dispatcher-lgob.onrender.com/docs)
- [Health Check](https://distributed-webhook-dispatcher-lgob.onrender.com/health)
- [GitHub Source Code](https://github.com/Krishn-01/distributed-webhook-dispatcher)

## Future Improvements

- Webhook authentication and signing.
- Dead-letter queue support.
- Advanced delivery analytics.
- Horizontal worker scaling.
- More comprehensive monitoring and observability.

## Author

**Krishn Kumar Pandey**

B.Tech – Information Technology

Noida Institute of Engineering & Technology

- GitHub: [Krishn-01](https://github.com/Krishn-01)
- Project Repository: [Distributed Webhook Dispatcher](https://github.com/Krishn-01/distributed-webhook-dispatcher)

---

<p align="center">

**Built to explore reliable asynchronous processing, distributed queues, backend architecture, and webhook delivery systems.**

</p>
