import { environmentValidationSchema } from '../src/config/env.validation';

describe('environment validation', () => {
  const minimum = {
    DATABASE_HOST: 'localhost',
    DATABASE_NAME: 'healthcare',
    DATABASE_USERNAME: 'postgres',
    DATABASE_PASSWORD: 'postgres',
    AWS_REGION: 'ap-south-1',
    AWS_S3_PUBLIC_BUCKET: 'public',
    AWS_S3_PRIVATE_BUCKET: 'private',
  };

  it('accepts a valid minimum configuration', () => {
    expect(environmentValidationSchema.validate(minimum).error).toBeUndefined();
  });

  it('rejects an invalid pool range', () => {
    const result = environmentValidationSchema.validate({
      ...minimum,
      DATABASE_POOL_MIN: 20,
      DATABASE_POOL_MAX: 10,
    });
    expect(result.error).toBeDefined();
  });

  it('requires a KMS key for aws:kms', () => {
    const result = environmentValidationSchema.validate({
      ...minimum,
      AWS_S3_SERVER_SIDE_ENCRYPTION: 'aws:kms',
    });
    expect(result.error).toBeDefined();
  });
});
