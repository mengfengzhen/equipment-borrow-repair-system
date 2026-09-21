import { IsIn, IsNumber, IsOptional, IsString, MinLength } from 'class-validator';
import { Type } from 'class-transformer';
import { RepairStatus } from '../common/constants';

export class RepairQueryDto {
  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  deviceType?: string;

  @IsOptional()
  @IsString()
  repairerId?: string;
}

export class CreateRepairDto {
  @IsString()
  deviceId!: string;

  @IsString()
  @MinLength(2)
  faultDescription!: string;

  @IsOptional()
  @IsString()
  repairerId?: string;
}

export class UpdateRepairStatusDto {
  @IsIn([
    RepairStatus.WAITING_PARTS,
    RepairStatus.FIXED,
    RepairStatus.UNREPAIRABLE,
  ])
  status!: string;

  @IsOptional()
  @IsString()
  result?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  cost?: number;
}

export class ConfirmRepairDto {
  @IsIn([
    RepairStatus.FIXED,
    RepairStatus.UNREPAIRABLE,
  ])
  status!: string;

  @IsOptional()
  @IsString()
  result?: string;

  @IsOptional()
  @IsString()
  location?: string;
}
