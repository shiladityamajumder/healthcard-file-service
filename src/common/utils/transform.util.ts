import { AppException } from '../exceptions/app.exception';

export function parseBoolean(value: unknown): unknown {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}

export function parseJsonObject(value: unknown): unknown {
  if (value === undefined || value === null || value === '') return {};
  if (typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value !== 'string') return value;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('not an object');
    }
    return parsed;
  } catch {
    throw new AppException(
      'INVALID_JSON_METADATA',
      'The metadata field must be a valid JSON object.',
      422,
    );
  }
}
