# Deployment runbook

Node.js 22+, NestJS, PostgreSQL, S3-compatible storage, and optional image/scanner services are required. PostgreSQL migrations are owned by `heathcare_db`; this service never creates, synchronizes, migrates, or drops them.

```bash
cp .env.example .env
npm ci
docker compose up --build
curl http://localhost:3000/health
```

Run as a non-root container behind a private load balancer. Use workload identity for S3, secret-manager injection for database/service secrets, `/health` for liveness, and `/ready` for dependency readiness. Prefer presigned uploads for large files. Monitor scanner outcomes, signed URL access, cleanup reconciliation, upload failures, and pool pressure.

Release sequence: apply compatible shared migrations, provision encrypted buckets/lifecycle/least-privilege policy, deploy, verify readiness and a controlled upload/download flow, then gradually route traffic.
