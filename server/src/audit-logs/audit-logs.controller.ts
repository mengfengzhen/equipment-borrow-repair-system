import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/auth.guard';
import { RequireRoles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { Roles } from '../common/constants';
import { AuditLogsService } from './audit-logs.service';

@ApiTags('audit-logs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('audit-logs')
export class AuditLogsController {
  constructor(private readonly auditLogsService: AuditLogsService) {}

  @Get()
  @RequireRoles(Roles.ADMIN)
  list() {
    return this.auditLogsService.list();
  }
}
