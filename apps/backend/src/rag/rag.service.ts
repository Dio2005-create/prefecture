import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { QdrantService } from '../ai/qdrant.service';
import { FastApiAiService } from '../ai/fastapi-ai.service';
import { findRequestModel, requestModels } from '../requests/request-models';
import { getRequestRequirements } from '../requests/request-requirements';

@Injectable()
export class RagService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: FastApiAiService,
    private readonly qdrant: QdrantService,
  ) {}

  async rechercher(question: string, topK: number) {
    const terms = this.termesRecherche(question);
    const variants = this.variantesRecherche(question);
    let semanticHits: Array<{ chunkId: string; documentId: string; contenu: string; score: number }> = [];
    try {
      const embedding = await this.ai.vectoriser(question);
      semanticHits = await this.qdrant.rechercher(embedding, topK);
    } catch {
    }
    const chunks = variants.length ? await this.prisma.chunk.findMany({
      where: { OR: variants.flatMap((term) => [
        { contenu: { contains: term, mode: 'insensitive' as const } },
        { document: { titre: { contains: term, mode: 'insensitive' as const } } },
      ]) },
      take: Math.max(topK * 10, 30),
      include: { document: { select: { id: true, titre: true } } },
    }) : [];
    const lexicalHits = chunks.map((chunk) => {
      const searchableText = this.normaliserTexte(`${chunk.document.titre} ${chunk.contenu}`);
      const matchedTerms = terms.filter((term) => searchableText.includes(term)).length;
      return {
        chunkId: chunk.id,
        documentId: chunk.documentId,
        contenu: chunk.contenu,
        score: 0.65 + 0.35 * matchedTerms / Math.max(terms.length, 1),
      };
    }).sort((left, right) => right.score - left.score);
    const lexicalIds = new Set(lexicalHits.map((hit) => hit.chunkId));
    const hits = [...lexicalHits, ...semanticHits.filter((hit) => !lexicalIds.has(hit.chunkId))];
    return hits.slice(0, topK);
  }

  async repondre(question: string, topK: number, utilisateurId?: string, conversationId?: string) {
    const activeConversationId = await this.obtenirOuCreerConversation(utilisateurId, conversationId, question);
    const language = this.detecterLangue(question);
    const requestType = findRequestModel(question);
    const localReply = requestType ? null : this.reponseLocaleQuestion(question, language);
    if (localReply) return this.enregistrerHistorique(question, localReply, [], utilisateurId, activeConversationId);
    let hits: Array<{ chunkId: string; documentId: string; contenu: string; score: number }> = await this.rechercher(question, topK);
    hits = hits.filter((hit) => !this.estDocumentDeConception(hit.contenu));
    if (!hits.length) {
      const variants = this.variantesRecherche(question);
      const documents = await this.prisma.documentAdministratif.findMany({
        where: variants.length ? { OR: variants.map((term) => ({ OR: [
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
    if (!hits.length && !requestType) {
      return this.enregistrerHistorique(question, this.reponseSansDocumentPertinent(language), [], utilisateurId, activeConversationId);
    }
    const contexte = [
      requestType ? this.contexteModele(requestType) : '',
      hits.map((hit: { contenu: string }, index: number) => `[${index + 1}] ${hit.contenu}`).join('\n\n'),
    ].filter(Boolean).join('\n\n');
    const prompt = [
        'Tu es l’assistant officiel de l’e-Préfecture.',
        language === 'mg'
          ? 'Valiny amin’ny teny malagasy ihany. Valio amin’ny teny malagasy mitovy amin’ny fanontaniana; aza mamaly amin’ny teny frantsay.'
          : 'Réponds exclusivement en français, comme la question. Ne bascule pas en malgache.',
        'Réponds uniquement aux questions concernant les démarches, services, documents, rendez-vous et demandes de la préfecture.',
        'Pour une question hors sujet, refuse poliment et invite la personne à demander de l’aide sur une démarche préfectorale.',
        'Les modèles administratifs officiels et leurs champs/pièces sont fournis dans le contexte. Utilise-les même en l’absence de résultat de recherche documentaire. N’invente pas de pièce ou de condition absente du modèle.',
        'Structure les réponses avec des rubriques courtes et des listes lisibles. Pour une démarche, sépare les étapes, les pièces à fournir et les éventuelles précisions.',
        'Écris en texte brut avec des titres et des puces. N’affiche ni syntaxe Markdown ni références comme [1] ou [2].',
        'Ne présente jamais de diagrammes de classes, de méthodes de programmation, d’attributs techniques ou de vues d’application comme une réponse administrative.',
      `Question : ${question}`,
      `Contexte :\n${contexte || '(aucun résultat)'}`,
    ].join('\n\n');
    let reponse: string;
    try {
      reponse = (await this.ai.generer(prompt)).trim();
      if (!reponse) throw new Error('Le modèle IA a retourné une réponse vide');
    } catch {
      reponse = requestType
        ? this.reponseModeleLocale(requestType, language)
        : this.construireReponseLocale(question, hits, language);
    }
    return this.enregistrerHistorique(question, reponse, hits, utilisateurId, activeConversationId);
  }

  private async obtenirOuCreerConversation(utilisateurId: string | undefined, conversationId: string | undefined, question: string) {
    if (!utilisateurId) throw new UnauthorizedException('Utilisateur non authentifié');
    if (conversationId) {
      const existing = await this.prisma.chatConversation.updateMany({
        where: { id: conversationId, utilisateurId },
        data: { updatedAt: new Date() },
      });
      if (!existing.count) throw new NotFoundException('Discussion introuvable');
      return conversationId;
    }
    const titre = question.trim().replace(/\s+/g, ' ').slice(0, 80) || 'Nouvelle discussion';
    const conversation = await this.prisma.chatConversation.create({ data: { utilisateurId, titre } });
    return conversation.id;
  }

  private async enregistrerHistorique(question: string, reponse: string, hits: Array<{ chunkId: string; documentId: string; contenu: string; score: number }>, utilisateurId: string | undefined, conversationId: string) {
    let historique: { id: string };
    try {
      historique = await this.prisma.requeteUtilisateur.create({
        data: {
          texte: question,
          utilisateurId,
          conversationId,
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
    return { id: historique.id, conversationId, reponse, sources: hits };
  }

  private reponseLocaleQuestion(question: string, language: 'fr' | 'mg') {
    const normalized = this.normaliserTexte(question).trim();
    if (/^(bonjour|salama|hello|bonsoir|bon matin)[!. ]*$/.test(normalized)) {
      return language === 'mg' ? 'Salama! Afaka manampy anao amin’ny raharaha momba ny prefektiora aho.' : 'Bonjour ! Je peux vous aider pour vos démarches auprès de la préfecture.';
    }
    if (/suivre|suivi|etat|statut|demande|dossier|fangatahana/.test(normalized)) {
      return language === 'mg' ? 'Azonao arahina ao amin’ny fizarana « Ny fangatahako » ny satan’ny dossier-nao.' : 'Vous pouvez suivre le statut de votre dossier dans la rubrique « Mes démarches ». ';
    }
    if (/rendez[- ]vous|appointment|reserver|réserver|creneau|créneau|fotoana/.test(normalized)) {
      return language === 'mg' ? 'Afaka mamandrika fotoana ianao ao amin’ny fizarana « Rendez-vous ».' : 'Vous pouvez réserver un créneau depuis la rubrique « Rendez-vous » de votre espace citoyen.';
    }
    if (/\b(meteo|football|recette|film|musique|blague|politique|crypto)\b/.test(normalized)) return language === 'mg' ? 'Mifantoka amin’ny raharaha momba ny prefektiora aho, ka tsy afaka mamaly izany fanontaniana ivelan’ny sehatra izany.' : 'Je suis spécialisé dans les démarches de la préfecture. Je ne peux pas répondre à cette question hors sujet.';
    return null;
  }

  private normaliserTexte(texte: string) {
    return texte.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  private detecterLangue(question: string): 'fr' | 'mg' {
    const normalized = this.normaliserTexte(question);
    const malagasyMarkers = ['ahoana', 'manao', 'hanaovana', 'fomba', 'inona', 'aiza', 'oviana', 'ohatrinona', 'firy', 'mila', 'takiana', 'taratasy', 'antontan', 'fanambarana', 'fahazoan', 'fanavaozana', 'fitarainana', 'fikambanana', 'sonia', 'karapanondro', 'kara-panondro', 'very', 'handray', 'haka', 'afaka', 'azafady', 'ianao', 've', 'ny', 'aminny'];
    return malagasyMarkers.some((marker) => new RegExp(`\\b${marker}\\b`).test(normalized)) ? 'mg' : 'fr';
  }

  private contexteModele(type: import('@prisma/client').RequestType) {
    const model = requestModels[type];
    const requirements = getRequestRequirements(type);
    return [
      `Démarche : ${model.title} (${model.titleMg})`,
      `Modèle PDF à utiliser : ${model.pdfFile}`,
      `Champs du formulaire : ${requirements.fields.map((item) => `${item.label}${item.required ? ' (obligatoire)' : ' (facultatif)'}`).join('; ')}`,
      `Pièces demandées : ${requirements.attachments.length ? requirements.attachments.map((item) => `${item.label}${item.required ? ' (obligatoire)' : ' (facultative)'}`).join('; ') : 'aucune pièce indiquée dans le modèle'}`,
      'Étapes générales : remplir les informations du modèle, joindre les pièces indiquées, vérifier le dossier puis le soumettre depuis l’espace citoyen.',
    ].join('\n');
  }

  private reponseModeleLocale(type: import('@prisma/client').RequestType, language: 'fr' | 'mg') {
    const model = requestModels[type];
    const requirements = getRequestRequirements(type);
    const fields = requirements.fields.map((item) => item.label).join(', ');
    const attachments = requirements.attachments.filter((item) => item.required).map((item) => item.label);
    const attachmentText = attachments.length ? attachments.join(', ') : (language === 'mg' ? 'Tsy misy antontan-taratasy fanampiny voatanisa ao amin’ny modely.' : 'Le modèle ne liste pas de pièce jointe obligatoire.');
    return language === 'mg'
      ? `Fomba fangatahana ${model.titleMg}\n1. Fenoy ny taratasy fangatahana miaraka amin’ny mombamomba anao: ${fields}.\n2. Ampidiro ireo antontan-taratasy ilaina: ${attachmentText}\n3. Hamarino ny antontan-taratasy ary alefaso ao amin’ny kaontinao e-Préfecture.`
      : `Pour la démarche « ${model.title} » :\n1. Remplissez le formulaire avec les informations suivantes : ${fields}.\n2. Joignez les pièces obligatoires : ${attachmentText}\n3. Vérifiez le dossier puis soumettez-le depuis votre espace e-Préfecture.`;
  }

  private termesRecherche(question: string) {
    const stopWords = new Set(['comment', 'on', 'fait', 'faire', 'une', 'un', 'le', 'la', 'les', 'de', 'du', 'des', 'pour', 'est', 'quel', 'quelle', 'quels', 'quelles', 'demarche', 'demarches', 'procedure', 'procedures']);
    return [...new Set(this.normaliserTexte(question).split(/[^a-z0-9]+/).filter((term) => term.length > 2 && !stopWords.has(term)))];
  }

  private variantesRecherche(question: string) {
    const stopWords = new Set(['comment', 'on', 'fait', 'faire', 'une', 'un', 'le', 'la', 'les', 'de', 'du', 'des', 'pour', 'est', 'quel', 'quelle', 'quels', 'quelles', 'demarche', 'demarches', 'procedure', 'procedures']);
    const originalTerms = question.toLowerCase().split(/[^a-zA-ZÀ-ÿ0-9]+/).filter((term) => term.length > 2 && !stopWords.has(this.normaliserTexte(term)));
    return [...new Set([...originalTerms, ...this.termesRecherche(question)])];
  }

  private estDocumentDeConception(contenu: string) {
    const normalized = this.normaliserTexte(contenu);
    return /diagramme de classes|agentcommunal|┌|└|▼|relations principales|modele mvc|composants du type|classe\s+(demande|acte|paiement)\b|getinfos\s*\(|calculercout\s*\(|listerpiecesrequises\s*\(|differentes vues necessaires|vue accueil\s*\/\s*authentification/i.test(normalized);
  }

  async historique(utilisateurId: string, limit = 30) {
    if (!utilisateurId) return [];
    await this.rattacherAnciensMessages(utilisateurId);
    const discussions = await this.prisma.chatConversation.findMany({
      where: { utilisateurId },
      orderBy: { updatedAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 100),
      select: {
        id: true,
        titre: true,
        updatedAt: true,
        messages: {
          orderBy: { date: 'asc' },
          select: { id: true, texte: true, reponseGeneree: true, date: true },
        },
      },
    });
    return discussions.map((discussion) => ({
      ...discussion,
      messages: discussion.messages.map((message) => ({
        ...message,
        reponseGeneree: message.reponseGeneree && this.estDocumentDeConception(message.reponseGeneree)
          ? 'Cette ancienne réponse contenait des éléments hors sujet. Posez à nouveau la question pour obtenir une réponse fondée sur les documents administratifs.'
          : message.reponseGeneree,
      })),
    }));
  }

  private async rattacherAnciensMessages(utilisateurId: string) {
    const anciensMessages = await this.prisma.requeteUtilisateur.findMany({
      where: { utilisateurId, conversationId: null },
      orderBy: { date: 'desc' },
      take: 100,
      select: { id: true, texte: true, date: true },
    });
    for (const message of anciensMessages) {
      await this.prisma.$transaction(async (transaction) => {
        const nonRattache = await transaction.requeteUtilisateur.findFirst({
          where: { id: message.id, utilisateurId, conversationId: null },
          select: { id: true, texte: true, date: true },
        });
        if (!nonRattache) return;
        const titre = nonRattache.texte.trim().replace(/\s+/g, ' ').slice(0, 80) || 'Ancienne discussion';
        const discussion = await transaction.chatConversation.create({
          data: { utilisateurId, titre, createdAt: nonRattache.date, updatedAt: nonRattache.date },
        });
        const linked = await transaction.requeteUtilisateur.updateMany({
          where: { id: nonRattache.id, utilisateurId, conversationId: null },
          data: { conversationId: discussion.id },
        });
        if (!linked.count) await transaction.chatConversation.delete({ where: { id: discussion.id } });
      });
    }
  }

  async renommerConversation(utilisateurId: string, conversationId: string, titre: string) {
    const normalizedTitle = titre.trim();
    if (!normalizedTitle) throw new BadRequestException('Le titre ne peut pas être vide');
    const updated = await this.prisma.chatConversation.updateMany({
      where: { id: conversationId, utilisateurId },
      data: { titre: normalizedTitle.slice(0, 80) },
    });
    if (!updated.count) throw new NotFoundException('Discussion introuvable');
    return this.prisma.chatConversation.findUniqueOrThrow({
      where: { id: conversationId },
      select: { id: true, titre: true, updatedAt: true },
    });
  }

  async supprimerConversation(utilisateurId: string, conversationId: string) {
    const deleted = await this.prisma.chatConversation.deleteMany({ where: { id: conversationId, utilisateurId } });
    if (!deleted.count) throw new NotFoundException('Discussion introuvable');
    return { success: true };
  }

  private construireReponseLocale(question: string, hits: Array<{ contenu: string }>, language: 'fr' | 'mg') {
    const normalized = this.normaliserTexte(question);
    if (/\bbonjour\b|\bsalama\b|\bhello\b/.test(normalized)) {
      return language === 'mg' ? 'Salama! Afaka manampy anao amin’ny raharaha momba ny prefektiora aho.' : 'Bonjour ! Je peux vous aider pour vos démarches auprès de la préfecture.';
    }
    if (/rendez[- ]vous|appointment|fotoana/.test(normalized)) {
      return language === 'mg' ? 'Afaka mangataka fotoana ianao ao amin’ny fizarana « Rendez-vous ».' : 'Vous pouvez réserver un créneau depuis la rubrique « Rendez-vous » de votre espace citoyen.';
    }
    if (/suivre|suivi|demande|fangatahana/.test(normalized)) {
      return language === 'mg' ? 'Azonao arahina ao amin’ny fizarana « Ny fangatahako » ny satan’ny dossier-nao.' : 'Vous pouvez suivre le statut de votre dossier dans la rubrique « Mes démarches ». ';
    }
    if (!hits.length) return this.reponseSansDocumentPertinent(language);
    const terms = this.termesRecherche(question);
    const sentences = hits.flatMap((hit) => hit.contenu.split(/(?<=[.!?])\s+/))
      .map((sentence) => sentence.trim())
      .filter((sentence) => sentence.length > 35)
      .map((sentence) => ({ sentence, score: terms.filter((term) => sentence.toLowerCase().includes(term)).length }))
      .sort((left, right) => right.score - left.score)
      .filter((item, index, all) => all.findIndex((candidate) => candidate.sentence === item.sentence) === index)
      .slice(0, 3)
      .map((item) => item.sentence);
    return sentences.length && language === 'fr'
      ? `Informations utiles\n\n${sentences.map((sentence) => `- ${sentence}`).join('\n')}`
      : this.reponseSansDocumentPertinent(language);
  }

  private reponseSansDocumentPertinent(language: 'fr' | 'mg') {
    return language === 'mg'
      ? 'Mba hahafahako manampy anao, lazao ny anaran’ny raharaha momba ny prefektiora tadiavinao.'
      : 'Précisez la démarche préfectorale recherchée pour que je puisse vous guider.';
  }
}
