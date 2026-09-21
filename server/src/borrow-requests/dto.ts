import { IsBoolean, IsDateString, IsIn, IsInt, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';
import { Type } from 'class-transformer';
import { ReturnCondition } from '../common/constants';

export class BorrowQueryDto {
  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  deviceId?: string;

  @IsOptional()
  @IsString()
  applicantId?: string;

  @IsOptional()
  @IsString()
  departmentId?: string;

  @IsOptional()
  @IsDateString()
  borrowStartAt?: string;

  @IsOptional()
  @IsDateString()
  borrowEndAt?: string;
}

export class CreateBorrowRequestDto {
  @IsOptional()
  @IsString()
  deviceId?: string;

  @IsOptional()
  @IsString()
  deviceGroupKey?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  quantity?: number;

  @IsDateString()
  borrowStartAt!: string;

  @IsDateString()
  borrowEndAt!: string;

  @IsString()
  @MinLength(2)
  purpose!: string;

  @IsOptional()
  @IsString()
  remark?: string;

  @IsOptional()
  @IsString()
  attachmentNames?: string;
}

export class ApprovalDto {
  @IsString()
  @MinLength(2)
  comment!: string;
}

export class SupplementDto {
  @IsString()
  @MinLength(2)
  purpose!: string;

  @IsOptional()
  @IsString()
  remark?: string;

  @IsOptional()
  @IsString()
  attachmentNames?: string;
}

export class ReturnBorrowDto {
  @IsIn([
    ReturnCondition.NORMAL,
    ReturnCondition.DAMAGED,
    ReturnCondition.MISSING_PARTS,
    ReturnCondition.ABNORMAL,
  ])
  returnCondition!: string;

  @IsString()
  @MinLength(2)
  returnRemark!: string;

  @IsOptional()
  @IsString()
  returnLocation?: string;

  @IsOptional()
  @IsBoolean()
  reportRepair?: boolean;

  @IsOptional()
  @IsString()
  repairDescription?: string;
}
