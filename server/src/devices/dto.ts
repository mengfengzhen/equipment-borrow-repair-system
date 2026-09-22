import { IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class DeviceQueryDto {
  @IsOptional()
  @IsString()
  keyword?: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  brand?: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsString()
  scope?: string;
}

export class BorrowOptionsQueryDto {
  @IsOptional()
  @IsDateString()
  borrowStartAt?: string;

  @IsOptional()
  @IsDateString()
  borrowEndAt?: string;
}

export class CreateDeviceDto {
  @IsString()
  name!: string;

  @IsString()
  type!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  quantity?: number;

  @IsOptional()
  @IsString()
  brand?: string;

  @IsOptional()
  @IsString()
  model?: string;

  @IsString()
  location!: string;

  @IsOptional()
  @IsString()
  ownerId?: string;

  @IsOptional()
  @IsDateString()
  purchaseDate?: string;

  @IsOptional()
  @IsDateString()
  warrantyExpireDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  value?: number;

  @IsOptional()
  @IsString()
  description?: string;
}

export class ImportDevicesDto {
  @IsString()
  csvText!: string;
}

export class DeviceDictionaryFieldDto {
  @IsIn(['type', 'brand', 'model', 'location'])
  field!: 'type' | 'brand' | 'model' | 'location';
}

export class CreateDeviceDictionaryDto {
  @IsString()
  value!: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsString()
  brand?: string;
}

export class UpdateDeviceDictionaryDto {
  @IsString()
  oldValue!: string;

  @IsString()
  value!: string;

  @IsOptional()
  @IsString()
  oldType?: string;

  @IsOptional()
  @IsString()
  oldBrand?: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsString()
  brand?: string;
}

export class DeleteDeviceDictionaryDto {
  @IsString()
  value!: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsString()
  brand?: string;
}

export class UpdateDeviceDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsString()
  brand?: string;

  @IsOptional()
  @IsString()
  model?: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsString()
  ownerId?: string;

  @IsOptional()
  @IsDateString()
  purchaseDate?: string;

  @IsOptional()
  @IsDateString()
  warrantyExpireDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  value?: number;

  @IsOptional()
  @IsString()
  description?: string;
}
