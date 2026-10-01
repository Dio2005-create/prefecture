import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import { SearchDocumentsDto } from '../documents/dto/search-documents.dto';
import { RagService } from './rag.service';
import { AuthGuard } from '../auth/auth.guard';
import { UpdateChatConversationDto } from './dto/update-chat-conversation.dto';

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
    return this.ragService.repondre(data.query, data.topK, request.user?.id, data.conversationId);
  }

  @Get('history')
  history(@Req() request: { user?: { id?: string } }, @Query('limit') limit?: string) {
    return this.ragService.historique(request.user?.id ?? '', Number(limit) || 30);
  }

  @Patch('history/:id')
  renameHistory(@Param('id') id: string, @Body() data: UpdateChatConversationDto, @Req() request: { user?: { id?: string } }) {
    if (!request.user?.id) throw new UnauthorizedException('Utilisateur non authentifié');
    return this.ragService.renommerConversation(request.user.id, id, data.titre);
  }

  @Delete('history/:id')
  deleteHistory(@Param('id') id: string, @Req() request: { user?: { id?: string } }) {
    if (!request.user?.id) throw new UnauthorizedException('Utilisateur non authentifié');
    return this.ragService.supprimerConversation(request.user.id, id);
  }
}
