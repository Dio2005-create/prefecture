import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { QdrantService } from '../ai/qdrant.service';
import { FastApiAiService } from '../ai/fastapi-ai.service';

@Injectable()
export class RagService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: FastApiAiService,
    private readonly qdrant: QdrantService,
  ) {}

  async rechercher(question: string, topK: number) {
    try {
      const embedding = await this.ai.vectoriser(question);
      return this.qdrant.rechercher(embedding, topK);
    } catch {
      const terms = question.toLowerCase().split(/\s+/).filter((term) => term.length > 2);
      const chunks = await this.prisma.chunk.findMany({
        where: terms.length ? { OR: terms.map((term) => ({ contenu: { contains: term, mode: 'insensitive' as const } })) } : undefined,
        take: topK * 3,
        include: { document: { select: { id: true } } },
      });
      return chunks.slice(0, topK).map((chunk: any, index: number) => ({
        chunkId: chunk.id,
        documentId: chunk.documentId,
        contenu: chunk.contenu,
        score: Math.max(0.1, 1 - index / Math.max(topK, 1)),
      }));
    }
  }

  async repondre(question: string, topK: number, utilisateurId?: string) {
    const localReply = this.reponseLocaleQuestion(question);
    if (localReply) return this.enregistrerHistorique(question, localReply, [], utilisateurId);
    let hits: Array<{ chunkId: string; documentId: string; contenu: string; score: number }> = await this.rechercher(question, topK);
    hits = hits.filter((hit) => !this.estDocumentDeConception(hit.contenu));
    const terms = question.toLowerCase().split(/\s+/).filter((term) => term.length > 2);
    const matchingHits = hits.filter((hit) => terms.some((term) => hit.contenu.toLowerCase().includes(term)));
    if (matchingHits.length) hits = matchingHits;
    if (!hits.length) {
      const documents = await this.prisma.documentAdministratif.findMany({
        where: terms.length ? { OR: terms.map((term) => ({ OR: [
          { titre: { contains: term, mode: 'insensitive' as const } },
          { contenuTexte: { contains: term, mode: 'insensitive' as const } },
        ] })) } : undefined,
        orderBy: { createdAt: 'desc' },
        take: topK,
      });
      hits = documents.map((document: any, index: number) => ({
        chunkId: '',
        documentId: document.id,
        contenu: (document.contenuTexte ?? '').slice(0, 1200),
        score: Math.max(0.1, 1 - index / Math.max(topK, 1)),
      })).filter((hit) => !this.estDocumentDeConception(hit.contenu));
    }
    const contexte = hits.map((hit: { contenu: string }, index: number) => `[${index + 1}] ${hit.contenu}`).join('\n\n');
      const prompt = [
        'Tu es l’assistant officiel de l’e-Préfecture.',
        'Détecte automatiquement la langue de la question parmi le français et le malgache, puis réponds dans cette même langue.',
        'Réponds uniquement aux questions concernant les démarches, services, documents, rendez-vous et demandes de la préfecture.',
        'Pour une question hors sujet, refuse poliment et invite la personne à demander de l’aide sur une démarche préfectorale.',
        'Réponds uniquement à partir du contexte fourni. Si le contexte ne permet pas de répondre, dis-le clairement.',
      `Question : ${question}`,
      `Contexte :\n${contexte || '(aucun résultat)'}`,
    ].join('\n\n');
    let reponse: string;
    try {
      reponse = await this.ai.generer(prompt);
    } catch {
      reponse = this.construireReponseLocale(question, hits);
    }
    return this.enregistrerHistorique(question, reponse, hits, utilisateurId);
  }

  private async enregistrerHistorique(question: string, reponse: string, hits: Array<{ chunkId: string; documentId: string; contenu: string; score: number }>, utilisateurId?: string) {
    let historique: { id: string };
    try {
      historique = await this.prisma.requeteUtilisateur.create({
        data: {
          texte: question,
          utilisateurId,
          reponseGeneree: reponse,
          sources: {
            create: hits.filter((hit: { chunkId: string }) => hit.chunkId).map((hit: { chunkId: string; score: number }) => ({ chunkId: hit.chunkId, score: hit.score })),
          },
        },
        select: { id: true },
      });
    } catch {
      historique = { id: `local-${Date.now()}` };
    }
    return { id: historique.id, reponse, sources: hits };
  }

  private reponseLocaleQuestion(question: string) {
    const normalized = question.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    const malagasy = /\bsalama\b|\bahoana\b|\bfangatahana\b|\bdia\b|\fotoana/.test(normalized);
    if (/^(bonjour|salama|hello|bonsoir|bon matin)[!. ]*$/.test(normalized)) {
      return malagasy ? 'Salama! Afaka manampy anao amin’ny raharaha momba ny prefektiora aho.' : 'Bonjour ! Je peux vous aider pour vos démarches auprès de la préfecture.';
    }
    if (/suivre|suivi|etat|statut|demande|dossier|fangatahana/.test(normalized)) {
      return malagasy ? 'Azonao arahina ao amin’ny fizarana « Ny fangatahako » ny satan’ny dossier-nao.' : 'Vous pouvez suivre le statut de votre dossier dans la rubrique « Mes démarches ».';
    }
    if (/rendez[- ]vous|appointment|reserver|réserver|creneau|créneau|fotoana/.test(normalized)) {
      return malagasy ? 'Afaka mamandrika fotoana ianao ao amin’ny fizarana « Rendez-vous ».' : 'Vous pouvez réserver un créneau depuis la rubrique « Rendez-vous » de votre espace citoyen.';
    }
    if (/acte de naissance|naissance|piece|pièce|documents? pour|certificat|cin|residence|résidence/.test(normalized)) return 'Pour connaître les pièces nécessaires, choisissez la démarche correspondante dans « Mes démarches » ou consultez le catalogue des services.';
    if (/\b(qui|quoi|comment|pourquoi|quand|ou|où|merci|help|aide)\b/.test(normalized) || malagasy) return 'Je peux vous aider uniquement pour les démarches, documents et rendez-vous de la préfecture.';
    if (/\b(meteo|football|recette|film|musique|blague|politique|crypto)\b/.test(normalized)) return 'Je suis spécialisé dans les démarches de la préfecture. Je ne peux pas répondre à cette question hors sujet.';
    return null;
  }

  private estDocumentDeConception(contenu: string) {
    return /diagramme de classes|agentcommunal|┌|└|▼|relations principales|modèle mvc|composants du type/i.test(contenu);
  }

  async historique(utilisateurId: string, limit = 30) {
    return this.prisma.requeteUtilisateur.findMany({
      where: { utilisateurId },
      orderBy: { date: 'desc' },
      take: Math.min(Math.max(limit, 1), 100),
      select: { id: true, texte: true, reponseGeneree: true, date: true },
    });
  }

  private construireReponseLocale(question: string, hits: Array<{ contenu: string }>) {
    const normalized = question.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (/\bbonjour\b|\bsalama\b|\bhello\b/.test(normalized)) {
      return /\bsalama\b/.test(normalized) ? 'Salama! Afaka manampy anao amin’ny raharaha momba ny prefektiora aho.' : 'Bonjour ! Je peux vous aider pour vos démarches auprès de la préfecture.';
    }
    if (/rendez[- ]vous|appointment|fotoana/.test(normalized)) {
      return /fotoana/.test(normalized) ? 'Afaka mangataka fotoana ianao ao amin’ny fizarana « Rendez-vous ».' : 'Vous pouvez réserver un créneau depuis la rubrique « Rendez-vous » de votre espace citoyen.';
    }
    if (/suivre|suivi|demande|fangatahana/.test(normalized)) {
      return /fangatahana/.test(normalized) ? 'Azonao arahina ao amin’ny fizarana « Ny fangatahako » ny satan’ny dossier-nao.' : 'Vous pouvez suivre le statut de votre dossier dans la rubrique « Mes démarches ». ';
    }
    if (!hits.length) return 'Aucun document indexé ne contient de termes correspondant à cette question.';
    const terms = question.toLowerCase().split(/\s+/).filter((term) => term.length > 2);
    const sentences = hits.flatMap((hit) => hit.contenu.split(/(?<=[.!?])\s+/))
      .map((sentence) => sentence.trim())
      .filter((sentence) => sentence.length > 35)
      .map((sentence) => ({ sentence, score: terms.filter((term) => sentence.toLowerCase().includes(term)).length }))
      .sort((left, right) => right.score - left.score)
      .filter((item, index, all) => all.findIndex((candidate) => candidate.sentence === item.sentence) === index)
      .slice(0, 3)
      .map((item) => item.sentence);
    return sentences.length
      ? `Voici les éléments trouvés concernant « ${question} » :\n\n[1] ${sentences.join(' ')}`
      : `Les documents indexés contiennent des informations, mais aucun passage court ne répond clairement à « ${question} ».`;
  }
}
