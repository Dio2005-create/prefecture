import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { readFile, unlink, writeFile } from 'node:fs/promises';
import { AuthGuard } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { AgentService } from './agent.service';
import { extractOfficialMark } from './official-mark-image';
import type { RequestStatus } from '@prisma/client';

@Controller('admin')
@UseGuards(AuthGuard, RolesGuard)
@Roles('ADMIN')
export class AgentController {
  constructor(private readonly agentService: AgentService) {}

  @Get('stats')
  async stats() {
    return this.agentService.getPrefectureStats();
  }

  @Get('settings')
  settings() { return this.agentService.listSettings(); }

  @Patch('settings')
  updateSettings(@Body() body: Record<string, string>) { return this.agentService.updateSettings(body); }

  @Get('templates')
  templates() {
    return this.agentService.listTemplates();
  }

  @Post('templates')
  @UseInterceptors(FileInterceptor('file', { dest: process.env.UPLOAD_DIR ?? './uploads' }))
  saveTemplate(
    @UploadedFile() file: { path: string; originalname: string; mimetype?: string } | undefined,
    @Body() body: { requestType: string; name: string; bodyText?: string; isActive?: string },
  ) {
    if (!file || !body.requestType || !body.name) throw new BadRequestException('Le type, le nom et le fichier du modèle sont obligatoires');
    if (!['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'].includes(file.mimetype ?? '')) {
      throw new BadRequestException('Le modèle doit être un fichier PDF ou Word');
    }
    return this.agentService.createTemplate({ requestType: body.requestType, name: body.name, bodyText: body.bodyText, storagePath: file.path, originalName: file.originalname, mimeType: file.mimetype });
  }

  @Post('templates/:id/activate')
  activateTemplate(@Param('id') id: string) { return this.agentService.activateTemplate(id); }

  @Post('templates/:id/deactivate')
  deactivateTemplate(@Param('id') id: string) { return this.agentService.deactivateTemplate(id); }

  @Delete('templates/:id')
  deleteTemplate(@Param('id') id: string) { return this.agentService.deleteTemplate(id); }

  @Get('marks')
  marks() {
    return this.agentService.listMarks();
  }

  @Post('marks/preview')
  @UseInterceptors(FileInterceptor('file', { dest: process.env.UPLOAD_DIR ?? './uploads', limits: { fileSize: 10 * 1024 * 1024 } }))
  async previewMark(
    @UploadedFile() file: { path: string; mimetype?: string } | undefined,
    @Res() response: Response,
  ) {
    if (!file) throw new BadRequestException('Sélectionnez une image PNG ou JPEG.');
    try {
      if (!['image/png', 'image/jpeg'].includes(file.mimetype ?? '')) {
        throw new BadRequestException('Le fichier doit être une image PNG ou JPEG.');
      }
      const image = await extractOfficialMark(await readFile(file.path));
      response.type('png').send(image);
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      const message = error instanceof Error ? error.message : 'Erreur inconnue';
      throw new BadRequestException(`L’extraction de l’image a échoué : ${message}`);
    } finally {
      await unlink(file.path);
    }
  }

  @Post('marks')
  @UseInterceptors(FileInterceptor('file', { dest: process.env.UPLOAD_DIR ?? './uploads', limits: { fileSize: 10 * 1024 * 1024 } }))
  async saveMark(
    @UploadedFile() file: { path: string; mimetype?: string } | undefined,
    @Body() body: { name: string; kind: string },
  ) {
    if (!file) throw new BadRequestException('Le nom, le type et le fichier sont obligatoires');
    if (!body.name?.trim() || !body.kind) {
      await unlink(file.path);
      throw new BadRequestException('Le nom, le type et le fichier sont obligatoires');
    }
    if (!['image/png', 'image/jpeg'].includes(file.mimetype ?? '')) {
      await unlink(file.path);
      throw new BadRequestException('Le cachet ou la signature doit être une image PNG ou JPEG.');
    }
    if (!['STAMP', 'SIGNATURE'].includes(body.kind)) {
      await unlink(file.path);
      throw new BadRequestException('Le type doit être un cachet ou une signature.');
    }

    let scannedImage: Buffer;
    try {
      scannedImage = await extractOfficialMark(await readFile(file.path));
    } catch (error) {
      await unlink(file.path);
      const message = error instanceof Error ? error.message : 'Erreur inconnue';
      throw new BadRequestException(`La numérisation de l’image a échoué : ${message}`);
    }

    await writeFile(file.path, scannedImage);
    try {
      return await this.agentService.createMark({
        name: body.name.trim(),
        kind: body.kind,
        storagePath: file.path,
        mimeType: 'image/png',
      });
    } catch (error) {
      await unlink(file.path);
      throw error;
    }
  }

  @Post('marks/:id/deactivate')
  deactivateMark(@Param('id') id: string) {
    return this.agentService.deactivateMark(id);
  }

  @Post('marks/:id/activate')
  activateMark(@Param('id') id: string) {
    return this.agentService.activateMark(id);
  }

  @Delete('marks/:id')
  deleteMark(@Param('id') id: string) {
    return this.agentService.deleteMark(id);
  }

  @Get('requests')
  async listRequests(@Query('status') status?: RequestStatus) {
    return this.agentService.listPendingRequests(status);
  }

  @Delete('requests/:id/view')
  hideRequest(@Param('id') id: string) {
    return this.agentService.hideRequest(id);
  }

  @Post('requests/:id/submit-review')
  @Roles('ADMIN')
  async submitForReview(@Param('id') id: string, @Req() req: { user?: { id: string } }, @Body() body?: { notes?: string }) {
    return this.agentService.submitForReview(id, req.user?.id ?? '', body?.notes);
  }

  @Post('requests/:id/validate')
  @Roles('ADMIN')
  async validateByChief(@Param('id') id: string, @Req() req: { user?: { id: string } }, @Body() body?: { notes?: string }) {
    return this.agentService.validateByChief(id, req.user?.id ?? '', body?.notes);
  }

  @Post('requests/:id/approve')
  @Roles('ADMIN')
  async approveRequest(@Param('id') id: string, @Req() req: { user?: { id: string } }, @Body() body?: { notes?: string }) {
    return this.agentService.approveRequest(id, req.user?.id ?? '', body?.notes);
  }

  @Post('requests/:id/reject')
  @Roles('ADMIN')
  async rejectRequest(@Param('id') id: string, @Req() req: { user?: { id: string } }, @Body() body: { reason: string }) {
    return this.agentService.rejectRequest(id, body.reason, req.user?.id ?? '');
  }

  @Post('requests/:id/request-info')
  @Roles('ADMIN')
  async requestMoreInfo(@Param('id') id: string, @Req() req: { user?: { id: string } }, @Body() body: { infoNeeded: string }) {
    return this.agentService.requestMoreInfo(id, body.infoNeeded, req.user?.id ?? '');
  }

  @Post('requests/:id/progress')
  @Roles('ADMIN')
  async moveToProgress(@Param('id') id: string) {
    return this.agentService.moveToInProgress(id);
  }

  @Patch('requests/:id')
  @Roles('ADMIN')
  updateRequest(@Param('id') id: string, @Req() req: { user?: { id: string } }, @Body() body: { formData?: Record<string, unknown>; description?: string; title?: string }) {
    return this.agentService.updateRequest(id, req.user?.id ?? '', body);
  }
}
