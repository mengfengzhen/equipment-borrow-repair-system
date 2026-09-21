import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/auth.guard';
import { Roles } from '../common/constants';
import { CurrentUser, RequestUser } from '../common/current-user.decorator';
import { RequireRoles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { ApprovalDto, BorrowQueryDto, CreateBorrowRequestDto, PickupBorrowDto, ReturnBorrowDto, SupplementDto } from './dto';
import { BorrowRequestsService } from './borrow-requests.service';

@ApiTags('borrow-requests')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('borrow-requests')
export class BorrowRequestsController {
  constructor(private readonly service: BorrowRequestsService) {}

  @Get()
  list(@Query() query: BorrowQueryDto, @CurrentUser() user: RequestUser) {
    return this.service.list(query, user);
  }

  @Get(':id/available-devices')
  @RequireRoles(Roles.ADMIN)
  availableDevices(@Param('id') id: string, @Query('location') location: string | undefined, @CurrentUser() user: RequestUser) {
    return this.service.availableDevicesForPickup(id, location, user);
  }

  @Get(':id')
  get(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.service.get(id, user);
  }

  @Post()
  @RequireRoles(Roles.USER)
  create(@Body() dto: CreateBorrowRequestDto, @CurrentUser() user: RequestUser) {
    return this.service.create(dto, user);
  }

  @Patch(':id/supplement')
  @RequireRoles(Roles.USER)
  supplement(@Param('id') id: string, @Body() dto: SupplementDto, @CurrentUser() user: RequestUser) {
    return this.service.supplement(id, dto, user);
  }

  @Patch(':id/cancel')
  @RequireRoles(Roles.USER)
  cancel(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.service.cancel(id, user);
  }

  @Patch(':id/approve')
  @RequireRoles(Roles.ADMIN, Roles.MANAGER)
  approve(@Param('id') id: string, @Body() dto: ApprovalDto, @CurrentUser() user: RequestUser) {
    return this.service.approve(id, dto, user);
  }

  @Patch(':id/reject')
  @RequireRoles(Roles.ADMIN, Roles.MANAGER)
  reject(@Param('id') id: string, @Body() dto: ApprovalDto, @CurrentUser() user: RequestUser) {
    return this.service.reject(id, dto, user);
  }

  @Patch(':id/need-more-info')
  @RequireRoles(Roles.ADMIN, Roles.MANAGER)
  needMoreInfo(@Param('id') id: string, @Body() dto: ApprovalDto, @CurrentUser() user: RequestUser) {
    return this.service.needMoreInfo(id, dto, user);
  }

  @Patch(':id/pickup')
  @RequireRoles(Roles.ADMIN)
  pickup(@Param('id') id: string, @Body() dto: PickupBorrowDto, @CurrentUser() user: RequestUser) {
    return this.service.pickup(id, dto, user);
  }

  @Patch(':id/return')
  @RequireRoles(Roles.ADMIN)
  returnDevice(@Param('id') id: string, @Body() dto: ReturnBorrowDto, @CurrentUser() user: RequestUser) {
    return this.service.returnDevice(id, dto, user);
  }
}
