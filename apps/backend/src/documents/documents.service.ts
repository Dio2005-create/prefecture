import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { StatutDocument, TypeDocument } from '@prisma/client';
import { QdrantService } from '../ai/qdrant.service';
import { FastApiAiService } from '../ai/fastapi-ai.service';
import { PrismaService } from '../prisma/prisma.service';
import { ChunkingService } from './chunking.service';
import { CreateDocumentDto } from './dto/create-document.dto';
import { QueryDocumentsDto, UpdateDocumentDto } from './dto/update-document.dto';

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

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
      throw new Error('Aucun texte n’a pu être extrait du document');
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
    const dateFilter = this.dateFilter(query.dateFrom, query.dateTo);
    const searchFilter = query.search ? [
      { titre: { contains: query.search, mode: 'insensitive' as const } },
      { reference: { contains: query.search, mode: 'insensitive' as const } },
      { contenuTexte: { contains: query.search, mode: 'insensitive' as const } },
      { chunks: { some: { contenu: { contains: query.search, mode: 'insensitive' as const } } } },
    ] : undefined;
    const where = {
      ...(query.type ? { type: query.type as TypeDocument } : {}),
      ...(query.categorieId ? { categorieId: query.categorieId } : {}),
      ...(query.statut ? { statut: query.statut as StatutDocument } : {}),
      ...(query.serviceEmetteur ? { serviceEmetteur: { contains: query.serviceEmetteur, mode: 'insensitive' as const } } : {}),
      ...(query.reference ? { reference: { contains: query.reference, mode: 'insensitive' as const } } : {}),
      ...(dateFilter ? { date: dateFilter } : {}),
      ...(searchFilter ? { OR: searchFilter } : {}),
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

  findOne(id: string) {
    return this.prisma.documentAdministratif.findUniqueOrThrow({
      where: { id },
      include: { categorie: true, chunks: { orderBy: { position: 'asc' } } },
    });
  }

  listPublic(query: QueryDocumentsDto) {
    const dateFilter = this.dateFilter(query.dateFrom, query.dateTo);
    const searchFilter = query.search ? [
      { titre: { contains: query.search, mode: 'insensitive' as const } },
      { reference: { contains: query.search, mode: 'insensitive' as const } },
      { contenuTexte: { contains: query.search, mode: 'insensitive' as const } },
    ] : undefined;
    return this.prisma.documentAdministratif.findMany({
      where: {
        type: { in: ['ARRETE', 'COURRIER'] },
        statut: { in: ['VALIDE', 'ARCHIVE'] },
        ...(dateFilter ? { date: dateFilter } : {}),
        ...(searchFilter ? { OR: searchFilter } : {}),
      },
      include: { categorie: true },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      take: 100,
    });
  }

  listPublications(query: QueryDocumentsDto) {
    const dateFilter = this.dateFilter(query.dateFrom, query.dateTo);
    const searchFilter = query.search ? [
      { titre: { contains: query.search, mode: 'insensitive' as const } },
      { reference: { contains: query.search, mode: 'insensitive' as const } },
      { contenuTexte: { contains: query.search, mode: 'insensitive' as const } },
    ] : undefined;
    return this.prisma.documentAdministratif.findMany({
      where: {
        type: { in: ['ARRETE', 'COURRIER'] },
        ...(dateFilter ? { date: dateFilter } : {}),
        ...(searchFilter ? { OR: searchFilter } : {}),
      },
      include: { categorie: true, _count: { select: { chunks: true } } },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      take: 100,
    });
  }

  private dateFilter(dateFrom?: string, dateTo?: string) {
    if (!dateFrom && !dateTo) return undefined;
    return {
      ...(dateFrom ? { gte: new Date(`${dateFrom}T00:00:00.000Z`) } : {}),
      ...(dateTo ? { lt: new Date(new Date(`${dateTo}T00:00:00.000Z`).getTime() + 24 * 60 * 60 * 1000) } : {}),
    };
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
    if (!chunks.length) throw new NotFoundException('Le document ne contient pas de texte indexable');
    await this.prisma.documentAdministratif.update({ where: { id }, data: { etapeTraitement: 'CHUNKING' } });
    try {
      const savedChunks = await this.prisma.$transaction(async (transaction) => {
        await transaction.chunk.deleteMany({ where: { documentId: id } });
        return transaction.chunk.createManyAndReturn({
          data: chunks.map((chunk) => ({ documentId: id, contenu: chunk.contenu, position: chunk.position })),
        });
      });
      const savedChunksByPosition = new Map(savedChunks.map((chunk) => [chunk.position, chunk]));
      const points: Array<{ id: string; vector: number[]; payload: object }> = [];
      for (const chunk of chunks) {
        const saved = savedChunksByPosition.get(chunk.position);
        if (!saved) throw new Error(`Le chunk ${chunk.position} n’a pas été enregistré`);
        await this.prisma.documentAdministratif.update({ where: { id }, data: { etapeTraitement: 'EMBEDDING' } });
        const vector = await this.ai.vectoriser(chunk.contenu);
        points.push({ id: saved.id, vector, payload: { documentId: id, titre: document.titre, contenu: chunk.contenu, position: chunk.position } });
      }
      await this.prisma.documentAdministratif.update({ where: { id }, data: { etapeTraitement: 'INDEXATION' } });
      await this.qdrant.supprimerDocument(id);
      await this.qdrant.indexer(points);
      return this.prisma.documentAdministratif.update({
        where: { id },
        data: { statut: 'VALIDE', erreurTraitement: null },
        include: { chunks: { orderBy: { position: 'asc' } } },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erreur de traitement';
      this.logger.error(`Échec de l’indexation du document ${id}: ${message}`);
      await this.prisma.documentAdministratif.update({
        where: { id },
        data: { statut: 'ERREUR', erreurTraitement: message },
      });
      throw error;
    }
  }

  async supprimer(id: string) {
    await this.prisma.documentAdministratif.findUniqueOrThrow({ where: { id } });
    await this.qdrant.supprimerDocument(id);
    return this.prisma.documentAdministratif.delete({ where: { id } });
  }
}
