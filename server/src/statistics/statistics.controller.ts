import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/auth.guard';
import { CurrentUser, RequestUser } from '../common/current-user.decorator';
import { StatisticsService } from './statistics.service';

@ApiTags('statistics')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('statistics')
export class StatisticsController {
  constructor(private readonly service: StatisticsService) {}

  @Get('dashboard')
  dashboard(@CurrentUser() user: RequestUser) {
    return this.service.dashboard(user);
  }

  @Get('devices')
  deviceStatus() {
    return this.service.deviceStatus();
  }

  @Get('reports')
  reports(@Query() query: { startAt?: string; endAt?: string; departmentId?: string; type?: string }) {
    return this.service.reports(query);
  }
}
