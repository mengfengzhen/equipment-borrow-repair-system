import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/auth.guard';
import { Roles } from '../common/constants';
import { CurrentUser, RequestUser } from '../common/current-user.decorator';
import { RequireRoles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { CreateRepairDto, RepairQueryDto, UpdateRepairStatusDto } from './dto';
import { RepairsService } from './repairs.service';

@ApiTags('repairs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('repairs')
export class RepairsController {
  constructor(private readonly service: RepairsService) {}

  @Get()
  @RequireRoles(Roles.ADMIN, Roles.REPAIRER)
  list(@Query() query: RepairQueryDto, @CurrentUser() user: RequestUser) {
    return this.service.list(query, user);
  }

  @Post()
  @RequireRoles(Roles.ADMIN)
  create(@Body() dto: CreateRepairDto, @CurrentUser() user: RequestUser) {
    return this.service.create(dto, user);
  }

  @Patch(':id/accept')
  @RequireRoles(Roles.REPAIRER)
  accept(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.service.accept(id, user);
  }

  @Patch(':id/status')
  @RequireRoles(Roles.REPAIRER)
  updateStatus(@Param('id') id: string, @Body() dto: UpdateRepairStatusDto, @CurrentUser() user: RequestUser) {
    return this.service.updateStatus(id, dto, user);
  }
}
