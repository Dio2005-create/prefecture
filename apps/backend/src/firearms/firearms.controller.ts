import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req, Res, UploadedFiles, UseGuards, UseInterceptors } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { AuthGuard } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { FirearmsService } from './firearms.service';

type AuthenticatedRequest = { user?: { id: string; role?: string; roles?: string[] } };
type UploadedFile = { path: string; originalname: string; mimetype?: string; size?: number };

@Controller('firearms')
@UseGuards(AuthGuard)
export class FirearmsController {
  constructor(private readonly firearms: FirearmsService) {}

  @Get()
  listMine(@Req() req: AuthenticatedRequest) {
    return this.firearms.listCitizenFirearms(req.user?.id ?? '');
  }

  @Get('permits')
  listMyPermits(@Req() req: AuthenticatedRequest) {
    return this.firearms.listCitizenPermits(req.user?.id ?? '');
  }

  @Get('requests')
  listMyRequests(@Req() req: AuthenticatedRequest) {
    return this.firearms.listCitizenRequests(req.user?.id ?? '');
  }

  @Post('requests')
  @UseInterceptors(FilesInterceptor('attachments', 15, {
    dest: process.env.UPLOAD_DIR ?? './uploads',
    limits: { fileSize: 10 * 1024 * 1024 },
  }))
  createRequest(
    @Req() req: AuthenticatedRequest,
    @Body() body: { type?: string; data?: string; attachmentLabels?: string },
    @UploadedFiles() files: UploadedFile[],
  ) {
    if (!req.user) throw new BadRequestException('Utilisateur non authentifié');
    let data: Record<string, unknown>;
    let labels: string[];
    try {
      const parsedData: unknown = body.data ? JSON.parse(body.data) : {};
      if (!parsedData || typeof parsedData !== 'object' || Array.isArray(parsedData)) throw new Error('invalid data');
      data = parsedData as Record<string, unknown>;
      labels = body.attachmentLabels ? JSON.parse(body.attachmentLabels) as string[] : [];
    } catch {
      throw new BadRequestException('Les données de la demande sont invalides');
    }
    if (!Array.isArray(labels) || labels.some((label) => typeof label !== 'string')) {
      throw new BadRequestException('Les catégories des pièces jointes sont invalides');
    }
    return this.firearms.createRequest(req.user.id, body.type ?? '', data, (files ?? []).map((file, index) => ({
      ...file,
      label: labels[index] ?? 'Justificatif',
    })));
  }

  @Get('requests/:id/attachments/:attachmentId')
  async downloadAttachment(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
    @Req() req: AuthenticatedRequest,
    @Res() response: Response,
  ) {
    if (!req.user) throw new BadRequestException('Utilisateur non authentifié');
    const { attachment, stream } = await this.firearms.getAttachment(id, attachmentId, req.user);
    response.set({
      'Content-Type': attachment.mimeType ?? 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(attachment.originalName)}"`,
    });
    stream.pipe(response);
  }

  @Get('requests/:id/document')
  async downloadOfficialDocument(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
    @Res() response: Response,
  ) {
    if (!req.user) throw new BadRequestException('Utilisateur non authentifié');
    const { pdf, filename } = await this.firearms.generateOfficialDocument(id, req.user);
    response.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${filename}"` });
    response.send(pdf);
  }

  @Get('admin/requests')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  listRequestsForAdmin(@Query('status') status?: string) {
    return this.firearms.listAdminRequests(status);
  }

  @Patch('admin/requests/:id/decision')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  decideRequest(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthenticatedRequest,
    @Body() body: { status?: string; comment?: string; expiresAt?: string },
  ) {
    if (!req.user) throw new BadRequestException('Utilisateur non authentifié');
    return this.firearms.decideRequest(id, req.user.id, body);
  }

  @Get('admin/citizens/:id')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  citizenDossier(@Param('id', ParseUUIDPipe) id: string) {
    return this.firearms.getCitizenDossier(id);
  }

  @Get('admin/search')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  searchSerial(@Query('serial') serial?: string) {
    return this.firearms.findBySerialNumber(serial ?? '');
  }

  @Get('admin/stats')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  stats() {
    return this.firearms.getAdminStats();
  }

  @Get('admin/report.csv')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  async downloadReport(@Res() response: Response) {
    const csv = await this.firearms.generateReport();
    response.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="rapport-controle-armements.csv"',
    });
    response.send(`\uFEFF${csv}`);
  }

  @Get('admin/:id/history')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  history(@Param('id', ParseUUIDPipe) id: string) {
    return this.firearms.getFirearmHistory(id);
  }
}
