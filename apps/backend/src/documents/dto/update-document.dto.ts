import { IsDateString, IsEnum, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { DocumentType } from './create-document.dto';

export enum DocumentStatus {
  BROUILLON = 'BROUILLON',
  EN_TRAITEMENT = 'EN_TRAITEMENT',
  VALIDE = 'VALIDE',
  ARCHIVE = 'ARCHIVE',
  ERREUR = 'ERREUR',
}

export class UpdateDocumentDto {
  @IsOptional()
  @IsString()
  @MaxLength(250)
  titre?: string;

  @IsOptional()
  @IsEnum(DocumentType)
  type?: DocumentType;

  @IsOptional()
  @IsString()
  reference?: string;

  @IsOptional()
  @IsString()
  serviceEmetteur?: string;

  @IsOptional()
  @IsString()
  auteurEmetteur?: string;

  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsUUID()
  categorieId?: string;

  @IsOptional()
  @IsEnum(DocumentStatus)
  statut?: DocumentStatus;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  scoreClassification?: number;
}

export class QueryDocumentsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(DocumentType)
  type?: DocumentType;

  @IsOptional()
  @IsUUID()
  categorieId?: string;

  @IsOptional()
  @IsString()
  @IsEnum(DocumentStatus)
  statut?: DocumentStatus;

  @IsOptional()
  @IsString()
  serviceEmetteur?: string;

  @IsOptional()
  @IsString()
  reference?: string;
}
