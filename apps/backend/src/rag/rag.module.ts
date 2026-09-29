import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { RagController } from './rag.controller';
import { RagService } from './rag.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AiModule, AuthModule],
  controllers: [RagController],
  providers: [RagService],
})
export class RagModule {}
