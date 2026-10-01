import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Post, Req, Res, UploadedFile, UploadedFiles, UseGuards, UseInterceptors } from '@nestjs/common';
import type { Response } from 'express';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '../auth/auth.guard';
import { Public } from '../auth/public.decorator';
import { RequestsService } from './requests.service';
import { CreateRequestDto } from './dto/create-request.dto';
import { PaymentProvider, RequestType } from '@prisma/client';

@Controller('requests')
@UseGuards(AuthGuard)
export class RequestsController {
  constructor(private readonly requestsService: RequestsService) {}

  @Get('services')
  services() {
    return this.requestsService.listAvailableServices();
  }

  @Get('requirements/:type')
  requirements(@Param('type') type: RequestType) {
    return this.requestsService.getRequirements(type);
  }

  @Get('models/:type/pdf')
  downloadModelPdf(@Param('type') type: string, @Res() response: Response) {
    const model = this.requestsService.getModelPdf(type);
    response.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${model.filename}"` });
    response.sendFile(model.path);
  }

  @Get('fees')
  @Public()
  fees() {
    return this.requestsService.listFees();
  }

  @Get('stats')
  stats(@Req() req: { user?: { id: string } }) {
    return this.requestsService.getDashboardStats(req.user?.id ?? '');
  }

  @Get()
  list(@Req() req: { user?: { id: string } }) {
    return this.requestsService.listByUser(req.user?.id ?? '');
  }

  @Post()
  create(@Req() req: { user?: { id: string } }, @Body() body: CreateRequestDto) {
    throw new BadRequestException('Les demandes doivent être envoyées avec leurs pièces jointes');
  }

  @Post('multipart')
  @UseInterceptors(FilesInterceptor('attachments', 30, { dest: process.env.UPLOAD_DIR ?? './uploads' }))
  createMultipart(
    @Req() req: { user?: { id: string } },
    @Body() body: { serviceId: string; type: RequestType; title?: string; description?: string; formData?: string; attachmentLabels?: string; paymentConfirmed?: string; paymentProvider?: string; paymentPhone?: string; confirmedAmount?: string; simulationPin?: string },
    @UploadedFiles() files: Array<{ path: string; originalname: string; mimetype?: string; size?: number }>,
  ) {
    if (!req.user) throw new BadRequestException('Utilisateur non authentifié');
    let formData: Record<string, unknown> = {};
    let attachmentLabels: string[] = [];
    try {
      formData = body.formData ? JSON.parse(body.formData) as Record<string, unknown> : {};
      attachmentLabels = body.attachmentLabels ? JSON.parse(body.attachmentLabels) as string[] : [];
    } catch {
      throw new BadRequestException('Les données du formulaire sont invalides');
    }
    if (!body.serviceId || !body.type) throw new BadRequestException('Le service et le type sont obligatoires');
    return this.requestsService.createMultipart(req.user.id, {
      ...body,
      type: body.type,
      formData,
      attachmentLabels,
      paymentConfirmed: body.paymentConfirmed === 'true',
      paymentProvider: body.paymentProvider as PaymentProvider | undefined,
      confirmedAmount: body.confirmedAmount === undefined ? undefined : Number(body.confirmedAmount),
    }, files ?? []);
  }

  @Get(':id')
  getOne(@Param('id', ParseUUIDPipe) id: string, @Req() req: { user?: { id: string; roles?: string[]; role?: string } }) {
    if (!req.user) throw new BadRequestException('Utilisateur non authentifié');
    return this.requestsService.findById(id, req.user);
  }

  @Get(':id/pdf')
  async downloadPdf(@Param('id', ParseUUIDPipe) id: string, @Req() req: { user?: { id: string; roles?: string[]; role?: string } }, @Res() response: Response) {
    if (!req.user) throw new BadRequestException('Utilisateur non authentifié');
    const pdf = await this.requestsService.generatePdf(id, req.user);
    response.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="demande-${id}.pdf"` });
    response.send(pdf);
  }

  @Get(':id/attachments/:attachmentId')
  async downloadAttachment(@Param('id', ParseUUIDPipe) id: string, @Param('attachmentId', ParseUUIDPipe) attachmentId: string, @Req() req: { user?: { id: string; roles?: string[]; role?: string } }, @Res() response: Response) {
    if (!req.user) throw new BadRequestException('Utilisateur non authentifié');
    const { attachment, stream } = await this.requestsService.getAttachment(id, attachmentId, req.user);
    response.set({ 'Content-Type': attachment.mimeType ?? 'application/octet-stream', 'Content-Disposition': `attachment; filename="${encodeURIComponent(attachment.originalName)}"` });
    stream.pipe(response);
  }

  @Post(':id/attachments')
  @UseInterceptors(FileInterceptor('file', { dest: process.env.UPLOAD_DIR ?? './uploads' }))
  addAttachment(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: { path: string; originalname: string; mimetype?: string; size?: number } | undefined,
    @Req() req: { user?: { id: string; roles?: string[]; role?: string } },
  ) {
    if (!file) throw new BadRequestException('Le fichier est obligatoire');
    if (!req.user) throw new BadRequestException('Utilisateur non authentifié');
    return this.requestsService.addAttachment(id, req.user, file);
  }
}
