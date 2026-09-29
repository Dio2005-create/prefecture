import { Module } from '@nestjs/common';
import { QdrantService } from './qdrant.service';
import { FastApiAiService } from './fastapi-ai.service';

@Module({
  providers: [QdrantService, FastApiAiService],
  exports: [QdrantService, FastApiAiService],
})
export class AiModule {}
