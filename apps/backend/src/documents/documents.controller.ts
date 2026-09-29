import { BadRequestException, Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CreateDocumentDto } from './dto/create-document.dto';
import { UploadDocumentDto } from './dto/upload-document.dto';
import { DocumentsService } from './documents.service';
import { QueryDocumentsDto, UpdateDocumentDto } from './dto/update-document.dto';
import { AuthGuard } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';

@Controller('documents')
@UseGuards(AuthGuard, RolesGuard)
@Roles('ADMIN')
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Post()
  @Roles('ADMIN')
  create(@Body() data: CreateDocumentDto) {
    return this.documentsService.create(data);
  }

  @Post('upload')
  @Roles('ADMIN')
  @UseInterceptors(FileInterceptor('file', { dest: process.env.UPLOAD_DIR ?? './uploads' }))
  async upload(
    @UploadedFile() file: { path: string; originalname: string } | undefined,
    @Body() data: UploadDocumentDto,
  ) {
    if (!file) throw new BadRequestException('Le fichier est obligatoire');
    const document = await this.documentsService.create({
      ...data,
      cheminFichier: file.path,
      titre: data.titre ?? file.originalname,
    });
    await this.documentsService.demarrerTraitement(document.id);
    void this.documentsService.traiter(document.id, file.path, file.originalname, data.type).catch(() => undefined);
    return document;
  }

  @Get()
  findAll(@Query() query: QueryDocumentsDto) {
    return this.documentsService.findAll(query);
  }

  @Get('public')
  @Roles('CITIZEN', 'ADMIN')
  publicDocuments() {
    return this.documentsService.listPublic();
  }

  @Patch(':id')
  @Roles('ADMIN')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() data: UpdateDocumentDto) {
    return this.documentsService.update(id, data);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.documentsService.findOne(id);
  }

  @Post(':id/index')
  @Roles('ADMIN')
  index(@Param('id', ParseUUIDPipe) id: string) {
    return this.documentsService.indexer(id);
  }

  @Delete(':id')
  @Roles('ADMIN')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.documentsService.supprimer(id);
  }
}
