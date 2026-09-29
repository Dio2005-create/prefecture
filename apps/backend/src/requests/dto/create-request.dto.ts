import { RequestType } from '@prisma/client';
import { IsEnum, IsNumber, IsObject, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export class CreateRequestDto {
  @IsUUID()
  serviceId!: string;

  @IsEnum(RequestType)
  type!: RequestType;

  @IsOptional()
  @IsString()
  @MaxLength(250)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @IsOptional()
  @IsObject()
  formData?: Record<string, unknown>;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100000000)
  fee?: number;
}
