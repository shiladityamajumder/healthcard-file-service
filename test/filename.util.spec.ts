import { getExtension, sanitizeFilename } from '../src/common/utils/filename.util';

describe('filename utilities', () => {
  it('removes paths and unsafe characters', () => {
    expect(sanitizeFilename('../../Patient Name (final).PDF')).toBe('patient-name-final.pdf');
  });

  it('does not preserve traversal segments', () => {
    const value = sanitizeFilename('..\\..\\secret.txt');
    expect(value).toBe('secret.txt');
    expect(value).not.toContain('..');
  });

  it('normalizes extensions', () => {
    expect(getExtension('photo.JPEG')).toBe('.jpeg');
  });
});
