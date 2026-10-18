import { BadRequestException, Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { QdrantService } from '../ai/qdrant.service';
import { FastApiAiService } from '../ai/fastapi-ai.service';
import { findRequestModel, requestModels } from '../requests/request-models';
import { getRequestRequirements } from '../requests/request-requirements';
import { existsSync } from 'node:fs';

@Injectable()
export class RagService {
  private readonly logger = new Logger(RagService.name);

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
    const personalDocumentSearch = this.extraireRechercheDocumentPersonnelle(question);
    if (personalDocumentSearch && utilisateurId) {
      const { hits, unreadableCount } = await this.rechercherDansDocumentsPersonnels(utilisateurId, personalDocumentSearch, topK);
      const response = hits.length
        ? this.reponseRechercheDocumentPersonnelle(personalDocumentSearch, hits, language, unreadableCount)
        : language === 'mg'
          ? `Tsy nahita antontan-taratasy tao amin’ny kaontinao misy ny teny hoe « ${personalDocumentSearch} » aho.${unreadableCount ? ` Tsy voavaky ny rakitra ${unreadableCount}, ka mety tsy feno ny valiny.` : ''}`
          : `Je n’ai trouvé aucun de vos documents contenant le mot « ${personalDocumentSearch} ».${unreadableCount ? ` ${unreadableCount} pièce(s) n’ont pas pu être lue(s), le résultat peut donc être incomplet.` : ''}`;
      return this.enregistrerHistorique(question, response, hits, utilisateurId, activeConversationId);
    }
    const isGreeting = this.estSalutation(question);
    const requestType = isGreeting ? null : findRequestModel(question);
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
        'Tu es l’assistant officiel de l’e-Servisy.',
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

  private extraireRechercheDocumentPersonnelle(question: string): string | null {
    const normalized = this.normaliserTexte(question);
    const parleDeDocuments = /\b(documents?|pieces?|fichiers?|dossiers?)\b/.test(normalized);
    const demandeRechercheExacte = /\b(contient|contiennent|contenant|contient-il|contient-elle|mot|terme)\b/.test(normalized);
    if (!parleDeDocuments || !demandeRechercheExacte) return null;

    const explicitTerm = question.match(/\b(?:mot|terme)\b\s*[:«"']?\s*([\p{L}\p{N}_-]+)/iu)?.[1];
    const candidate = explicitTerm ?? this.termesRecherche(question).at(-1);
    return candidate?.trim() || null;
  }

  private async rechercherDansDocumentsPersonnels(
    utilisateurId: string,
    term: string,
    topK: number,
  ): Promise<{
    hits: Array<{ chunkId: string; documentId: string; contenu: string; score: number }>;
    unreadableCount: number;
  }> {
    const requests = await this.prisma.serviceRequest.findMany({
      where: { userId: utilisateurId },
      orderBy: { createdAt: 'desc' },
      include: {
        service: { select: { nameFr: true } },
        attachments: {
          select: {
            id: true,
            label: true,
            originalName: true,
            storagePath: true,
            mimeType: true,
            extractedText: true,
          },
        },
      },
    });
    const pendingOcr = requests.flatMap((request) => request.attachments
      .filter((attachment) => !attachment.extractedText &&
        ['application/pdf', 'image/jpeg', 'image/png'].includes(attachment.mimeType ?? ''))
      .map((attachment) => ({ attachment, requestId: request.id })));
    let unreadableCount = 0;

    for (let offset = 0; offset < pendingOcr.length; offset += 4) {
      await Promise.all(pendingOcr.slice(offset, offset + 4).map(async ({ attachment, requestId }) => {
        if (!existsSync(attachment.storagePath)) {
          unreadableCount += 1;
          this.logger.warn(`Fichier indisponible pour la recherche du document ${attachment.id} de la demande ${requestId}`);
          return;
        }
        try {
          const extractedText = await this.ai.extraireTexte(attachment.storagePath, attachment.originalName);
          if (!extractedText) {
            unreadableCount += 1;
            return;
          }
          await this.prisma.requestAttachment.update({
            where: { id: attachment.id },
            data: { extractedText },
          });
          attachment.extractedText = extractedText;
        } catch (error) {
          unreadableCount += 1;
          this.logger.warn(
            `OCR indisponible pour la pièce ${attachment.id} de la demande ${requestId}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }));
    }

    const normalizedTerm = this.normaliserTexte(term);
    const exactTerm = new RegExp(`(^|[^a-z0-9])${this.echapperExpressionReguliere(normalizedTerm)}($|[^a-z0-9])`);
    const hits = requests.flatMap((request) => {
      const formData = request.formData && typeof request.formData === 'object'
        ? JSON.stringify(request.formData)
        : '';
      const attachmentMatches = request.attachments.filter((attachment) =>
        [attachment.label, attachment.originalName, attachment.extractedText]
          .some((value) => value && exactTerm.test(this.normaliserTexte(value))));
      const requestContent = [request.title, request.description, formData]
        .filter((value): value is string => Boolean(value))
        .join('\n');
      const requestMatches = exactTerm.test(this.normaliserTexte(requestContent));
      if (!requestMatches && !attachmentMatches.length) return [];

      const matchedFiles = attachmentMatches.map((attachment) => attachment.originalName).join(', ');
      const matchingFields = requestContent.split(/[\n,;{}"]+/)
        .map((value) => value.trim())
        .filter((value) => exactTerm.test(this.normaliserTexte(value)))
        .slice(0, 4);
      const date = new Intl.DateTimeFormat('fr-FR', {
        dateStyle: 'short',
        timeZone: 'Indian/Antananarivo',
      }).format(request.createdAt);
      const excerpt = [
        `Demande : ${request.title ?? request.service.nameFr}`,
        `Service : ${request.service.nameFr}`,
        `Statut : ${request.status}`,
        `Créée le : ${date}`,
        matchingFields.length ? `Informations correspondantes : ${matchingFields.join(' ; ')}` : '',
        matchedFiles ? `Pièces correspondantes : ${matchedFiles}` : '',
      ].filter(Boolean).join('\n');
      return [{
        chunkId: '',
        documentId: request.id,
        contenu: excerpt,
        score: 1,
      }];
    }).slice(0, Math.max(1, Math.min(topK, 20)));
    return { hits, unreadableCount };
  }

  private reponseRechercheDocumentPersonnelle(
    term: string,
    hits: Array<{ contenu: string }>,
    language: 'fr' | 'mg',
    unreadableCount: number,
  ) {
    const documents = hits.map((hit) => {
      const fields = Object.fromEntries(hit.contenu.split('\n').map((line) => {
        const separator = line.indexOf(': ');
        return separator < 0 ? ['', ''] : [line.slice(0, separator), line.slice(separator + 2)];
      }));
      const title = fields['Demande'] ?? 'Document';
      const service = fields['Service'] ? ` — ${fields['Service']}` : '';
      const status = fields['Statut'] ? ` (${fields['Statut']})` : '';
      const matched = fields['Informations correspondantes'] ?? fields['Pièces correspondantes'];
      return `- ${title}${service}${status}${matched ? ` — ${matched}` : ''}`;
    });
    const unreadableNotice = unreadableCount
      ? language === 'mg'
        ? `\nTsy voavaky ny rakitra ${unreadableCount}, ka mety tsy feno ny valiny.`
        : `\n${unreadableCount} pièce(s) n’ont pas pu être lue(s), le résultat peut donc être incomplet.`
      : '';
    return language === 'mg'
      ? `Ireto ny antontan-taratasy ao amin’ny kaontinao ahitana ny teny hoe « ${term} »:\n${documents.join('\n')}${unreadableNotice}`
      : `J’ai trouvé ${hits.length} document(s) dans votre compte contenant le mot « ${term} » :\n${documents.join('\n')}${unreadableNotice}`;
  }

  private echapperExpressionReguliere(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
    if (this.estSalutation(normalized)) {
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

  private estSalutation(question: string) {
    const normalized = this.normaliserTexte(question).trim();
    return /^(?:bonjour|salama(?:\s+tompoko)?|manao ahoana(?:\s+tompoko)?|hello|bonsoir|bon matin)[!?,.\s]*$/.test(normalized);
  }

  private normaliserTexte(texte: string) {
    return texte.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  private detecterLangue(question: string): 'fr' | 'mg' {
    const normalized = this.normaliserTexte(question);
    const malagasyMarkers = ['salama', 'ahoana', 'manao', 'hanaovana', 'fomba', 'inona', 'aiza', 'oviana', 'ohatrinona', 'firy', 'mila', 'takiana', 'taratasy', 'antontan', 'fanambarana', 'fahazoan', 'fanavaozana', 'fitarainana', 'fikambanana', 'sonia', 'karapanondro', 'kara-panondro', 'very', 'handray', 'haka', 'afaka', 'azafady', 'ianao', 've', 'ny', 'aminny'];
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
      ? `Fomba fangatahana ${model.titleMg}\n1. Fenoy ny taratasy fangatahana miaraka amin’ny mombamomba anao: ${fields}.\n2. Ampidiro ireo antontan-taratasy ilaina: ${attachmentText}\n3. Hamarino ny antontan-taratasy ary alefaso ao amin’ny kaontinao e-Servisy.`
      : `Pour la démarche « ${model.title} » :\n1. Remplissez le formulaire avec les informations suivantes : ${fields}.\n2. Joignez les pièces obligatoires : ${attachmentText}\n3. Vérifiez le dossier puis soumettez-le depuis votre espace e-Servisy.`;
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
    if (/\bbonjour\b|\bsalama\b|\bmanao ahoana\b|\bhello\b/.test(normalized)) {
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
