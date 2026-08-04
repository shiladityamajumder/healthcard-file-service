import { extname } from 'node:path';

export function sanitizeFilename(filename: string): string {
  // eslint-disable-next-line no-control-regex -- filenames must not retain control characters
  const normalized = filename.normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g, '');
  const basename = normalized.split(/[\\/]/).pop() ?? 'file';
  const extension = extname(basename)
    .toLowerCase()
    .replace(/[^.a-z0-9]/g, '');
  const stem = basename
    .slice(0, Math.max(0, basename.length - extension.length))
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/\.{2,}/g, '.')
    .replace(/^-+|-+$/g, '')
    .slice(0, 160);
  return `${stem || 'file'}${extension}`.slice(0, 200);
}

export function getExtension(filename: string): string {
  return extname(filename).toLowerCase();
}
