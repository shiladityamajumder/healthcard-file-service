import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { FILE_SCANNER } from './file-scanner.interface';
import { NoopFileScannerService } from './noop-file-scanner.service';

@Module({
  imports: [ConfigModule],
  providers: [
    NoopFileScannerService,
    {
      // Bind behind an interface so production can replace the development scanner without changing callers.
      provide: FILE_SCANNER,
      useExisting: NoopFileScannerService,
    },
  ],
  exports: [FILE_SCANNER],
})
export class FileScanningModule {}
