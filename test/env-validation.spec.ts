import { environmentValidationSchema } from '../src/config/env.validation';

describe('environment validation', () => {
  const minimum = {
    DATABASE_URL: 'postgresql://app_user:secret@localhost:5432/healthcare',
    AWS_REGION: 'ap-south-1',
    AWS_S3_PUBLIC_BUCKET: 'public',
    AWS_S3_PRIVATE_BUCKET: 'private',
  };

  it.each([
    'postgresql://app_user:secret@localhost:5432/healthcare',
    'postgres://app_user:secret@localhost:5432/healthcare',
  ])('accepts a valid PostgreSQL URL using %s', (databaseUrl) => {
    expect(
      environmentValidationSchema.validate({ ...minimum, DATABASE_URL: databaseUrl }).error,
    ).toBeUndefined();
  });

  it('requires DATABASE_URL', () => {
    const withoutDatabaseUrl: Partial<typeof minimum> = { ...minimum };
    delete withoutDatabaseUrl.DATABASE_URL;
    const result = environmentValidationSchema.validate(withoutDatabaseUrl);
    expect(result.error?.message).toContain('DATABASE_URL is required');
  });

  it('rejects a non-PostgreSQL URL scheme without echoing credentials', () => {
    const result = environmentValidationSchema.validate({
      ...minimum,
      DATABASE_URL: 'mysql://sensitive-user:sensitive-password@database.internal/healthcare',
    });
    expect(result.error?.message).toContain('postgresql:// or postgres://');
    expect(result.error?.message).not.toContain('sensitive-user');
    expect(result.error?.message).not.toContain('sensitive-password');
  });

  it('rejects an invalid PostgreSQL URL without echoing credentials', () => {
    const result = environmentValidationSchema.validate({
      ...minimum,
      DATABASE_URL: 'postgresql://sensitive-user:sensitive-password@not a host/healthcare',
    });
    expect(result.error?.message).toContain('valid PostgreSQL connection URL');
    expect(result.error?.message).not.toContain('sensitive-user');
    expect(result.error?.message).not.toContain('sensitive-password');
  });

  it('rejects an invalid pool range', () => {
    const result = environmentValidationSchema.validate({
      ...minimum,
      DATABASE_POOL_MIN: 20,
      DATABASE_POOL_MAX: 10,
    });
    expect(result.error).toBeDefined();
    expect(result.error?.message).toContain('DATABASE_POOL_MIN cannot exceed DATABASE_POOL_MAX');
  });

  it.each([
    ['DATABASE_POOL_MIN', 0],
    ['DATABASE_POOL_MAX', -1],
    ['DATABASE_CONNECTION_TIMEOUT_MS', 0],
  ])('requires %s to be a positive integer', (name, value) => {
    const result = environmentValidationSchema.validate({ ...minimum, [name]: value });
    expect(result.error).toBeDefined();
  });

  it('applies secure database SSL and pool defaults', () => {
    const result = environmentValidationSchema.validate(minimum);
    expect(result.value).toMatchObject({
      DATABASE_SSL: false,
      DATABASE_SSL_REJECT_UNAUTHORIZED: true,
      DATABASE_POOL_MIN: 2,
      DATABASE_POOL_MAX: 10,
      DATABASE_CONNECTION_TIMEOUT_MS: 10000,
    });
  });

  it('requires a KMS key for aws:kms', () => {
    const result = environmentValidationSchema.validate({
      ...minimum,
      AWS_S3_SERVER_SIDE_ENCRYPTION: 'aws:kms',
    });
    expect(result.error).toBeDefined();
  });
});
