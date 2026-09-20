import { IsBoolean } from 'class-validator';

export class UpdateSettingsDto {
  @IsBoolean()
  approvalRequired!: boolean;
}
