import { Module } from '@nestjs/common';
import { FILE_SCANNER } from './file-scanner.interface';
import { NoopFileScannerService } from './noop-file-scanner.service';

@Module({
  providers: [NoopFileScannerService, { provide: FILE_SCANNER, useExisting: NoopFileScannerService }],
  exports: [FILE_SCANNER],
})
export class FileScanningModule {}
