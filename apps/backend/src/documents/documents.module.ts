import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { ChunkingService } from './chunking.service';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AiModule, AuthModule],
  controllers: [DocumentsController],
  providers: [DocumentsService, ChunkingService],
})
export class DocumentsModule {}
