export const FILE_SCANNER = Symbol('FILE_SCANNER');

export interface FileScanInput {
  buffer?: Buffer;
  bucket?: string;
  objectKey?: string;
  contentType: string;
  sha256: string;
}

export interface FileScanResult extends Record<string, unknown> {
  clean: boolean;
  scanner: string;
  status: 'clean' | 'infected' | 'failed';
  findings: Record<string, unknown>;
}

export interface FileScanner {
  scan(input: FileScanInput): Promise<FileScanResult>;
}
