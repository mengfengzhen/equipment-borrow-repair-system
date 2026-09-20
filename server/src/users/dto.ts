import { IsBoolean, IsEmail, IsIn, IsOptional, IsString } from 'class-validator';
import { Roles } from '../common/constants';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsIn([Roles.ADMIN, Roles.MANAGER, Roles.USER, Roles.REPAIRER])
  role?: string;

  @IsOptional()
  @IsString()
  departmentId?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
