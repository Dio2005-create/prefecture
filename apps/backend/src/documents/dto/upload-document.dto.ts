import { IsDateString, IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { DocumentScope, DocumentType } from './create-document.dto';

export class UploadDocumentDto {
  @IsOptional()
  @IsString()
  @MaxLength(250)
  titre?: string;

  @IsEnum(DocumentType)
  type!: DocumentType;

  @IsOptional()
  @IsEnum(DocumentScope)
  scope?: DocumentScope;

  @IsOptional()
  @IsUUID()
  categorieId?: string;

  @IsOptional()
  @IsDateString()
  date?: string;
}
