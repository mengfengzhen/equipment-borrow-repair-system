import { Module } from '@nestjs/common';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { RepairsController } from './repairs.controller';
import { RepairsService } from './repairs.service';

@Module({
  imports: [AuditLogsModule],
  controllers: [RepairsController],
  providers: [RepairsService],
})
export class RepairsModule {}
