<div align="center">

# Healthcare File Service

**Secure public and private file workflows for the healthcare platform**

![Node.js](https://img.shields.io/badge/Node.js-22-339933?logo=nodedotjs&logoColor=white)
![NestJS](https://img.shields.io/badge/NestJS-11-E0234E?logo=nestjs&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-metadata-4169E1?logo=postgresql&logoColor=white)
![Amazon S3](https://img.shields.io/badge/Amazon_S3-objects-569A31?logo=amazons3&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-ready-2496ED?logo=docker&logoColor=white)

</div>

## Overview

Healthcare File Service is a standalone NestJS service for validated healthcare file uploads, metadata, private downloads, public asset delivery, replacement, deletion, and resource association. PostgreSQL stores authoritative metadata while Amazon S3 or an S3-compatible service stores file bytes.

The service supports bounded server-side uploads and direct-to-S3 presigned uploads. It does not authenticate users, create database objects, provision buckets, or bundle PostgreSQL, MinIO, workers, or malware infrastructure.

## Core documentation

| Resource | Purpose |
|---|---|
| [API reference](docs/API.md) | Reserved API reference file |
| [Deployment runbook](docs/DEPLOYMENT.md) | Local, container, production, verification, and rollback procedures |
| [Architecture](ARCHITECTURE.md) | Boundaries, workflows, persistence, consistency, and security design |
| [Environment template](.env.example) | Complete commented runtime configuration |

### Storage infrastructure

[Production S3 setup](docs/S3_SETUP.md) is the detailed implementation guide for buckets, SSE-KMS, IAM, CloudFront, CORS, lifecycle, audit logging, malware controls, verification, and service settings.

## Capabilities

- Validated single and multiple server-side uploads
- Idempotent direct-to-S3 upload reservation and completion
- Public assets through CloudFront-compatible stable URLs
- Private files through short-lived presigned downloads
- Server-controlled object keys without clinical data or raw client paths
- MIME, extension, byte signature, size, category, resource, and visibility checks
- Public image variants generated with Sharp
- Transactional metadata and association updates with S3 compensation
- Structured logs, request correlation, stable errors, and dependency health probes

## Technology

| Area | Choice |
|---|---|
| Runtime | Node.js 22, NestJS 11, TypeScript 5 |
| Metadata | PostgreSQL, TypeORM |
| Objects | AWS SDK v3, Amazon S3 or compatible storage |
| Media | Multer, file-type, Sharp |
| Operations | Pino, Swagger, Docker, Jest, ESLint |

## Service boundaries

- `healthcare_db` exclusively owns PostgreSQL schemas and migrations.
- `auth_service` and the trusted gateway own authentication and authorization.
- The deployment platform owns S3, KMS, CloudFront, malware scanning, secrets, and networking.
- This service owns validation, object naming, storage operations, file metadata, associations, and workflow consistency.

Private healthcare content must never be placed in the public bucket. Public S3 access remains blocked; CloudFront Origin Access Control is the recommended public delivery path.

## Quick start

```bash
cp .env.example .env
npm ci
npm run build
docker compose up --build
curl http://localhost:3000/health/ready
```

PostgreSQL and S3-compatible storage must already exist and be reachable. For AWS production setup, complete the [S3 guide](docs/S3_SETUP.md) before deployment.

## Runtime endpoints

- `/health/live` — process liveness
- `/health/ready` — PostgreSQL and both S3 bucket checks
- `/docs` — Swagger UI when enabled
- `/openapi.json` — generated OpenAPI document when enabled
- `/api/v1/files` — versioned file workflow API

## Production warning

The included scanner is a development no-op adapter. Production startup blocks it unless an explicit risk override is supplied. A real synchronous scanner or event-driven quarantine workflow is required before handling healthcare files.
