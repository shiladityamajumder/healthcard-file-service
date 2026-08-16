# File service architecture

The service is a stateless NestJS application coordinating trusted gateway requests, PostgreSQL metadata, and S3-compatible object storage. Multipart uploads use compensating cleanup; presigned uploads use an idempotent reservation and completion flow.

The shared database and migrations belong exclusively to `heathcare_db`. Private downloads use short-lived signed URLs. See the detailed [architecture document](ARCHITECTURE.md), [API reference](docs/API.md), and [deployment runbook](docs/DEPLOYMENT_RUNBOOK.md).
