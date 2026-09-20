import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/auth.guard';
import { Roles } from '../common/constants';
import { RequireRoles } from '../common/roles.decorator';
import { RolesGuard } from '../common/roles.guard';
import { UpdateSettingsDto } from './dto';
import { SettingsService } from './settings.service';

@ApiTags('settings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  getSettings() {
    return this.settingsService.getSettings();
  }

  @Patch()
  @RequireRoles(Roles.ADMIN)
  updateSettings(@Body() dto: UpdateSettingsDto) {
    return this.settingsService.updateApprovalRequired(dto.approvalRequired);
  }
}
