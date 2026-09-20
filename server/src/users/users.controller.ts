import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/auth.guard';
import { Roles } from '../common/constants';
import { CurrentUser, RequestUser } from '../common/current-user.decorator';
import { RequireRoles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { UpdateUserDto } from './dto';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('users')
  @RequireRoles(Roles.ADMIN)
  list() {
    return this.usersService.list();
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
