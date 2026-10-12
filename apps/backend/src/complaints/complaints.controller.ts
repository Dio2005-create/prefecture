import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Req, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { AuthGuard } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ComplaintsService } from './complaints.service';

type UploadedComplaintFile = { path: string; originalname: string; mimetype?: string; size?: number };

@Controller('complaints')
@UseGuards(AuthGuard)
export class ComplaintsController {
  constructor(private readonly complaints: ComplaintsService) {}

  @Get('documents')
  eligibleDocuments(@Req() req: { user?: { id: string } }) {
    return this.complaints.eligibleDocuments(req.user?.id ?? '');
  }

  @Get()
  listCitizen(@Req() req: { user?: { id: string } }) {
    return this.complaints.listForCitizen(req.user?.id ?? '');
  }

  @Post()
  @UseInterceptors(FileInterceptor('file', {
    dest: process.env.UPLOAD_DIR ?? './uploads',
    limits: { fileSize: 10 * 1024 * 1024 },
  }))
  create(
    @Req() req: { user?: { id: string } },
    @Body() body: { documentRequestId?: string; reason?: string; details?: string },
    @UploadedFile() file?: UploadedComplaintFile,
  ) {
    if (!req.user) throw new BadRequestException('Utilisateur non authentifié');
    if (!file) throw new BadRequestException('Ajoutez un document justificatif à votre réclamation.');
    return this.complaints.create(req.user.id, body, file);
  }

  @Get('admin')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  listAdmin() {
    return this.complaints.listForAdmin();
  }

  @Patch(':id/review')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  markInReview(@Param('id', ParseUUIDPipe) id: string) {
    return this.complaints.markInReview(id);
  }

  @Post(':id/resolve')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  resolve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { corrections?: Record<string, string>; response?: string },
  ) {
    return this.complaints.resolve(id, body.corrections ?? {}, body.response ?? '');
  }

  @Post(':id/reject')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  reject(@Param('id', ParseUUIDPipe) id: string, @Body() body: { response?: string }) {
    return this.complaints.reject(id, body.response ?? '');
  }

  @Get(':id/attachments/:attachmentId')
  async downloadAttachment(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
    @Req() req: { user?: { id: string; roles?: string[]; role?: string } },
    @Res() response: Response,
  ) {
    if (!req.user) throw new BadRequestException('Utilisateur non authentifié');
    const { attachment, stream } = await this.complaints.getAttachment(id, attachmentId, req.user);
    response.set({
      'Content-Type': attachment.mimeType ?? 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(attachment.originalName)}"`,
    });
    stream.pipe(response);
  }
}
