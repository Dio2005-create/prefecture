import { IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export class SearchDocumentsDto {
  @IsString()
  query!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  topK = 5;

  @IsOptional()
  @IsUUID()
  conversationId?: string;
}
