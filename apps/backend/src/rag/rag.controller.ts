import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { SearchDocumentsDto } from '../documents/dto/search-documents.dto';
import { RagService } from './rag.service';
import { AuthGuard } from '../auth/auth.guard';

@Controller('rag')
@UseGuards(AuthGuard)
export class RagController {
  constructor(private readonly ragService: RagService) {}

  @Post('search')
  search(@Body() data: SearchDocumentsDto) {
    return this.ragService.rechercher(data.query, data.topK);
  }

  @Post('ask')
  ask(@Body() data: SearchDocumentsDto, @Req() request: { user?: { id?: string } }) {
    return this.ragService.repondre(data.query, data.topK, request.user?.id);
  }

  @Get('history')
  history(@Req() request: { user?: { id?: string } }, @Query('limit') limit?: string) {
    return this.ragService.historique(request.user?.id ?? '', Number(limit) || 30);
  }
}
