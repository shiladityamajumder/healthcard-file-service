# Contributing

1. Do not add migrations or enable TypeORM synchronization.
2. Verify every new table/column mapping against `healthcare_db` and update `DATABASE_MAPPING.md`.
3. Do not accept arbitrary schema, table, column, bucket, key, or prefix values from requests.
4. Add stable error codes for new failure cases.
5. Add tests for validation, compensation, and authorization-sensitive behavior.
6. Run:

```bash
npm run format
npm run lint
npm run build
npm test
./scripts/verify-no-schema-management.sh
```

Do not commit `.env`, credentials, signed URLs, patient data, file contents, `node_modules`, `dist`, or coverage output.
