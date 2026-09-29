import { Injectable, NotFoundException } from '@nestjs/common';
import { StatutDocument, TypeDocument } from '@prisma/client';
import { QdrantService } from '../ai/qdrant.service';
import { FastApiAiService } from '../ai/fastapi-ai.service';
import { PrismaService } from '../prisma/prisma.service';
import { ChunkingService } from './chunking.service';
import { CreateDocumentDto } from './dto/create-document.dto';
import { QueryDocumentsDto, UpdateDocumentDto } from './dto/update-document.dto';

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly chunker: ChunkingService,
    private readonly ai: FastApiAiService,
    private readonly qdrant: QdrantService,
  ) {}

  create(data: CreateDocumentDto) {
    return this.prisma.documentAdministratif.create({
      data: {
        titre: data.titre,
        type: data.type as TypeDocument,
        cheminFichier: data.cheminFichier,
        contenuTexte: data.contenuTexte,
        categorieId: data.categorieId,
        reference: data.reference,
        serviceEmetteur: data.serviceEmetteur,
        auteurEmetteur: data.auteurEmetteur,
        date: data.date ? new Date(data.date) : new Date(),
      },
      include: { categorie: true, chunks: true },
    });
  }

  async traiter(id: string, path: string, filename: string, type: string) {
    try {
      const categorie = await this.prisma.categorie.upsert({
        where: { libelle: type },
        update: {},
        create: { libelle: type, motsCles: [] },
      });
      const texte = await this.ai.extraireTexte(path, filename);
      await this.prisma.documentAdministratif.update({
        where: { id },
        data: { contenuTexte: texte || null, categorieId: categorie.id, methodeClassification: 'AUTOMATIQUE', etapeTraitement: 'OCR' },
      });
      if (texte) return this.indexer(id);
      return this.findOne(id);
    } catch (error) {
      await this.prisma.documentAdministratif.update({ where: { id }, data: { statut: 'ERREUR', erreurTraitement: error instanceof Error ? error.message : 'Erreur de traitement' } });
      return this.findOne(id);
    }
  }

  demarrerTraitement(id: string) {
    return this.prisma.documentAdministratif.update({
      where: { id },
      data: { statut: 'EN_TRAITEMENT', etapeTraitement: 'OCR', erreurTraitement: null },
    });
  }

  async findAll(query: QueryDocumentsDto) {
    await this.normaliserDocumentsExistants();
    const where = {
      ...(query.type ? { type: query.type as TypeDocument } : {}),
      ...(query.categorieId ? { categorieId: query.categorieId } : {}),
      ...(query.statut ? { statut: query.statut as StatutDocument } : {}),
      ...(query.serviceEmetteur ? { serviceEmetteur: { contains: query.serviceEmetteur, mode: 'insensitive' as const } } : {}),
      ...(query.reference ? { reference: { contains: query.reference, mode: 'insensitive' as const } } : {}),
      ...(query.search ? { OR: [
        { titre: { contains: query.search, mode: 'insensitive' as const } },
        { reference: { contains: query.search, mode: 'insensitive' as const } },
      ] } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.documentAdministratif.findMany({
        where,
        include: { categorie: true, _count: { select: { chunks: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.documentAdministratif.count({ where }),
    ]);
    return { items, total, page: query.page, limit: query.limit };
  }

  private async normaliserDocumentsExistants() {
    const documents = await this.prisma.documentAdministratif.findMany({
      where: { statut: { in: ['BROUILLON', 'EN_TRAITEMENT'] }, contenuTexte: { not: null } },
      select: { id: true, contenuTexte: true },
    });
    for (const document of documents) {
      const chunks = this.chunker.decouper(document.contenuTexte ?? '');
      if (!chunks.length) continue;
      const count = await this.prisma.chunk.count({ where: { documentId: document.id } });
      if (!count) {
        await this.prisma.chunk.createMany({ data: chunks.map((chunk) => ({ documentId: document.id, contenu: chunk.contenu, position: chunk.position })) });
      }
      await this.prisma.documentAdministratif.update({ where: { id: document.id }, data: { statut: 'VALIDE', etapeTraitement: 'INDEXATION', erreurTraitement: null } });
    }
  }

  findOne(id: string) {
    return this.prisma.documentAdministratif.findUniqueOrThrow({
      where: { id },
      include: { categorie: true, chunks: { orderBy: { position: 'asc' } } },
    });
  }

  listPublic() {
    return this.prisma.documentAdministratif.findMany({
      where: { type: { in: ['ARRETE', 'COURRIER'] }, statut: { in: ['VALIDE', 'ARCHIVE'] } },
      include: { categorie: true },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      take: 100,
    });
  }

  update(id: string, data: UpdateDocumentDto) {
    return this.prisma.documentAdministratif.update({
      where: { id },
      data: {
        ...data,
        type: data.type as TypeDocument | undefined,
        statut: data.statut as StatutDocument | undefined,
        date: data.date ? new Date(data.date) : undefined,
      },
      include: { categorie: true },
    });
  }

  async indexer(id: string) {
    const document = await this.prisma.documentAdministratif.findUnique({ where: { id } });
    if (!document) throw new NotFoundException('Document introuvable');
    if (!document.contenuTexte?.trim()) {
      throw new NotFoundException('Le document ne contient pas encore de texte à indexer');
    }

    const chunks = this.chunker.decouper(document.contenuTexte);
    await this.prisma.documentAdministratif.update({ where: { id }, data: { etapeTraitement: 'CHUNKING' } });
    try { await this.qdrant.supprimerDocument(id); } catch { }
    await this.prisma.chunk.deleteMany({ where: { documentId: id } });
    const savedChunks = await this.prisma.chunk.createManyAndReturn({
      data: chunks.map((chunk) => ({ documentId: id, contenu: chunk.contenu, position: chunk.position })),
    });
    for (const chunk of chunks) {
      const saved = savedChunks[chunk.position];
      try {
        await this.prisma.documentAdministratif.update({ where: { id }, data: { etapeTraitement: 'EMBEDDING' } });
        const vector = await this.ai.vectoriser(chunk.contenu);
        await this.prisma.documentAdministratif.update({ where: { id }, data: { etapeTraitement: 'INDEXATION' } });
        await this.qdrant.indexer([{ id: saved.id, vector, payload: { documentId: id, contenu: chunk.contenu, position: chunk.position } }]);
      } catch { }
    }
    return this.prisma.documentAdministratif.update({
      where: { id },
      data: { statut: 'VALIDE' },
      include: { chunks: { orderBy: { position: 'asc' } } },
    });
  }

  async supprimer(id: string) {
    await this.prisma.documentAdministratif.findUniqueOrThrow({ where: { id } });
    await this.qdrant.supprimerDocument(id);
    return this.prisma.documentAdministratif.delete({ where: { id } });
  }
}
