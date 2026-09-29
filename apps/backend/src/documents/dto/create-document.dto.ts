import { IsDateString, IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export enum DocumentType {
  ACTE = 'ACTE',
  ARRETE = 'ARRETE',
  COURRIER = 'COURRIER',
  AUTRE = 'AUTRE',
}

export class CreateDocumentDto {
  @IsString()
  @MaxLength(250)
  titre!: string;

  @IsEnum(DocumentType)
  type!: DocumentType;

  @IsString()
  cheminFichier!: string;

  @IsOptional()
  @IsString()
  contenuTexte?: string;

  @IsOptional()
  @IsUUID()
  categorieId?: string;

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
}
