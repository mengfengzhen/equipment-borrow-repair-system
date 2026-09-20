import { Module } from '@nestjs/common';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { SettingsModule } from '../settings/settings.module';
import { BorrowRequestsController } from './borrow-requests.controller';
import { BorrowRequestsService } from './borrow-requests.service';

@Module({
  imports: [AuditLogsModule, SettingsModule],
  controllers: [BorrowRequestsController],
  providers: [BorrowRequestsService],
})
export class BorrowRequestsModule {}
