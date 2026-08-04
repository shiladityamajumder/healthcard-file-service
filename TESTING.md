# Testing

## Commands

```bash
npm test
npm run test:watch
npm run test:cov
npm run test:e2e
npm run lint
npm run build
```

## Included coverage

- filename sanitization and traversal prevention;
- object-key structure and variant paths;
- metadata MIME/extension/size validation;
- resource allowlist, visibility rules, and required association metadata;
- public URL generation for CloudFront and path-style endpoints;
- environment validation;
- health controller behavior;
- controller delegation;
- S3 compensation after database persistence failure;
- exception envelope behavior.

AWS calls are not required for unit tests. The S3 client is instantiated only for pure URL-generation tests; network commands should be mocked in additional provider tests.

## Integration setup

1. Start PostgreSQL and MinIO with Docker Compose.
2. Apply `healthcare_db` migrations to PostgreSQL.
3. Use a dedicated test database and buckets.
4. Run tests with `NODE_ENV=test` and isolated prefixes.
5. Delete created objects and rows after tests.

Never run destructive integration tests against production buckets or production healthcare data.

## Recommended future tests

- LocalStack/MinIO direct upload completion;
- transaction rollback with S3 compensation;
- concurrent replacement optimistic conflict;
- expired presigned session state transition;
- cleanup reconciliation worker;
- real scanner adapter contract;
- large multipart upload once multipart support is added.
