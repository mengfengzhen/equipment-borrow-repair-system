import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/auth.guard';
import { Roles } from '../common/constants';
import { CurrentUser, RequestUser } from '../common/current-user.decorator';
import { RequireRoles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { CreateUserDto, UpdateUserDto } from './dto';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('users')
  @RequireRoles(Roles.ADMIN, Roles.MANAGER)
  list(@CurrentUser() user: RequestUser) {
    return this.usersService.list(user);
  }

  @Post('users')
  @RequireRoles(Roles.ADMIN, Roles.MANAGER)
  create(@Body() dto: CreateUserDto, @CurrentUser() user: RequestUser) {
    return this.usersService.create(dto, user);
  }

  @Patch('users/:id')
  @RequireRoles(Roles.ADMIN)
  update(@Param('id') id: string, @Body() dto: UpdateUserDto, @CurrentUser() user: RequestUser) {
    return this.usersService.update(id, dto, user);
  }

  @Get('departments')
  departments() {
    return this.usersService.departments();
  }
}
