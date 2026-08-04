import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { FileScanner, FileScanInput, FileScanResult } from './file-scanner.interface';

@Injectable()
export class NoopFileScannerService implements FileScanner, OnModuleInit {
  private readonly logger = new Logger(NoopFileScannerService.name);

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const production = this.config.get<string>('app.nodeEnv') === 'production';
    const explicitlyAllowed =
      this.config.get<boolean>('app.allowNoopScannerInProduction') === true;
    if (production && !explicitlyAllowed) {
      throw new Error(
        'The development no-op file scanner is disabled in production. Configure a real scanner provider.',
      );
    }
    this.logger.warn(
      'No malware inspection is active. Replace the development scanner before production deployment.',
    );
  }

  async scan(_input: FileScanInput): Promise<FileScanResult> {
    return {
      clean: true,
      scanner: 'noop-development-scanner',
      status: 'clean',
      findings: { warning: 'No malware inspection was performed.' },
    };
  }
}
