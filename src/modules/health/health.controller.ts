import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { InjectDataSource } from '@nestjs/typeorm';
import type { DataSource } from 'typeorm';
import { AppException } from '../../common/exceptions/app.exception';
import { S3StorageService } from '../storage/providers/s3-storage.service';

@ApiTags('Health')
@Controller()
export class HealthController {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly storage: S3StorageService,
  ) {}

  @Get(['health', 'health/live'])
  @ApiOperation({ summary: 'Process liveness' })
  @ApiOkResponse({ schema: { example: { status: 'alive' } } })
  liveness(): Record<string, unknown> {
    // Liveness answers only whether this process is running; dependency checks belong to readiness.
    return { status: 'alive' };
  }

  @Get(['ready', 'health/ready'])
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Database and S3 readiness' })
  @ApiOkResponse({
    schema: {
      example: {
        ready: true,
        checks: { postgresql: true, publicBucket: true, privateBucket: true },
      },
    },
  })
  @ApiServiceUnavailableResponse({ description: 'At least one dependency is unavailable.' })
  async readiness(): Promise<Record<string, unknown>> {
    // PostgreSQL and S3 are checked independently so one failed dependency does not hide the other.
    let postgresql = false;
    try {
      // Read-only connectivity probe; readiness must never create or inspect schema objects.
      await this.dataSource.query('SELECT 1');
      postgresql = true;
    } catch {
      postgresql = false;
    }
    const storage = await this.storage.checkConnectivity();
    const ready = postgresql && storage.publicBucket && storage.privateBucket;
    const payload = { ready, checks: { postgresql, ...storage } };
    if (!ready) {
      throw new AppException(
        'SERVICE_NOT_READY',
        'One or more required dependencies are unavailable.',
        503,
        payload,
      );
    }
    return payload;
  }
}
