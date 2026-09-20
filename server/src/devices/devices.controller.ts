import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { JwtAuthGuard } from '../common/auth.guard';
import { DeviceStatus, Roles } from '../common/constants';
import { CurrentUser, RequestUser } from '../common/current-user.decorator';
import { RequireRoles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { CreateDeviceDto, DeviceQueryDto, UpdateDeviceDto } from './dto';
import { DevicesService } from './devices.service';

@ApiTags('devices')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('devices')
export class DevicesController {
  constructor(
    private readonly devicesService: DevicesService,
    private readonly auditLogs: AuditLogsService,
  ) {}

  @Get()
  list(@Query() query: DeviceQueryDto) {
    return this.devicesService.list(query);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.devicesService.get(id);
  }

  @Get(':id/history')
  history(@Param('id') id: string) {
    return this.devicesService.history(id);
  }

  @Post()
  @RequireRoles(Roles.ADMIN)
  create(@Body() dto: CreateDeviceDto, @CurrentUser() user: RequestUser) {
    return this.devicesService.create(dto, user);
  }

  @Patch(':id')
  @RequireRoles(Roles.ADMIN)
  update(@Param('id') id: string, @Body() dto: UpdateDeviceDto, @CurrentUser() user: RequestUser) {
    return this.devicesService.update(id, dto, user);
  }

  @Patch(':id/disable')
  @RequireRoles(Roles.ADMIN)
  disable(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.devicesService.changeStatus(id, DeviceStatus.DISABLED, user);
  }

  @Patch(':id/scrap')
  @RequireRoles(Roles.ADMIN)
  scrap(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.devicesService.changeStatus(id, DeviceStatus.SCRAPPED, user);
  }

  @Delete(':id')
  @RequireRoles(Roles.ADMIN)
  remove(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.devicesService.remove(id, user);
  }
}
