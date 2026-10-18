# Services et fonctionnalités du backend — e-Servisy d'Ihosy

## 1. Objet et lecture du document

Ce document explique les responsabilités des modules et services présents dans `apps/backend/src`. Il décrit le code du dépôt, pas une garantie que chaque dépendance externe est configurée ou qu'un paiement réel est activé.

Le backend est construit avec NestJS. Les contrôleurs exposent les routes HTTP, les DTO valident les entrées, les guards authentifient les sessions et vérifient les rôles, les services exécutent les règles métier, et Prisma accède à PostgreSQL.

## 2. Vue d'ensemble des modules

| Module | Fonction principale |
|---|---|
| `AppModule` | Assemble les modules métier et les services partagés. |
| `AuthModule` | Inscription, connexion, session, changement/réinitialisation de mot de passe et préférences linguistiques. |
| `UsersModule` | Profil, comptes administrateurs, activation/désactivation des comptes et réactivation. |
| `RequestsModule` | Catalogue des services, démarches citoyennes, formulaires, pièces justificatives, suivi et PDF. |
| `AppointmentsModule` | Créneaux, disponibilités, réservation, annulation, suivi administratif et tickets PDF. |
| `PaymentsModule` | Initialisation et consultation des paiements rattachés à une démarche. L'initiation actuelle crée un paiement de démonstration ; elle ne confirme pas une transaction réelle auprès d'un opérateur. |
| `ComplaintsModule` | Réclamations citoyennes, justificatifs et traitement par l'administration. |
| `NotificationsModule` | Notifications personnelles, diffusion aux administrateurs et marquage comme lu. |
| `DocumentsModule` | Import, OCR, traitement, indexation, consultation et publication contrôlée des documents administratifs. |
| `RagModule` | Recherche personnelle, réponses de l'assistant et historique des conversations. |
| `AiModule` | Services d'appel à FastAPI IA et Qdrant. `OllamaService` est présent comme implémentation alternative mais n'est pas fourni par le module actif. |
| `AgentModule` | Fonctions de l'administration : demandes à traiter, statistiques, modèles, réglages, cachets et signatures. |
| `PrismaModule` | Fournit le client Prisma partagé et gère son cycle de vie. |

## 3. Services backend

### Authentification et comptes

- **`AuthService`** (`auth/`) : crée les comptes citoyens, vérifie les identifiants, gère les sessions, valide le compte à chaque requête protégée, ferme ou révoque des sessions, modifie le mot de passe et la langue du compte, et pilote les demandes de réactivation et de réinitialisation par code.
- **`AuthGuard`** : lit le jeton de session, demande sa validation à `AuthService` et attache l'identité authentifiée à la requête. Une route non publique sans session valide est refusée.
- **`RolesGuard` et décorateur `Roles`** : restreignent les opérations administratives aux rôles configurés.
- **`UsersService`** : retourne le profil non secret, liste les comptes pour l'administration, crée les administrateurs, change le statut d'un citoyen et traite les demandes de réactivation.
- **`MailerService`** : envoie les courriels transactionnels de vérification, réinitialisation, réactivation, désactivation et résolution de réclamation, selon la configuration SMTP.

### Démarches et services communaux

- **`RequestsService`** : fournit le catalogue des services actifs, les exigences et modèles de formulaires, les tarifs, les statistiques personnelles, la création et la modification de démarches, les contrôles de formulaire et de pièces, l'ajout/remplacement des fichiers, l'OCR des justificatifs, la génération des PDF et les règles de propriété.
- **`request-models.ts` et `request-requirements.ts`** : référentiels de types de démarche, alias français/malgaches, champs, pièces obligatoires/facultatives et contraintes propres aux formulaires.
- **`PaymentsService`** : vérifie qu'une démarche appartient au citoyen avant d'initialiser un paiement et ne liste que les paiements de cet utilisateur. Le mode présent dans le dépôt utilise un identifiant `SANDBOX-*`; l'intégration effective d'opérateurs est à réaliser et à valider.
- **`AppointmentsService`** : calcule les créneaux disponibles, gère leur configuration, réserve/annule un rendez-vous, attribue les rendez-vous CIN, met à jour les statuts et génère les tickets PDF. Un citoyen ne récupère que ses rendez-vous et ses tickets.
- **`ComplaintsService`** : détermine les démarches éligibles à une réclamation, crée et liste les réclamations du citoyen, contrôle les justificatifs, fournit le parcours administratif de revue/résolution/rejet et vérifie les droits au téléchargement.
- **`NotificationsService`** : crée des notifications destinées à un utilisateur précis ou aux administrateurs, liste celles du compte fourni et ne marque comme lue qu'une notification appartenant à ce compte.

### Documents, traitement IA et assistant

- **`DocumentsService`** : gère les documents administratifs, leur import et statut de traitement, lance l'OCR et la classification, découpe le texte, crée les chunks, demande les embeddings et synchronise les vecteurs. La liste publique est limitée aux catégories et statuts autorisés ; la gestion du fonds est une fonction administrative.
- **`ChunkingService`** : découpe le texte OCR en segments adaptés à l'indexation et à la recherche.
- **`FastApiAiService`** : appelle le service IA configuré pour les embeddings, la génération, la classification et l'OCR ; remonte une erreur de disponibilité explicite si le service échoue.
- **`QdrantService`** : crée la collection vectorielle, indexe/supprime les vecteurs et effectue la recherche vectorielle du fonds documentaire. L'index global du fonds administratif n'est pas une source autorisée du chat personnel.
- **`OllamaService`** : implémente des appels locaux d'embedding et de génération. Il n'est pas enregistré dans `AiModule` dans la configuration actuelle.
- **`RagService`** : recherche le texte exact dans les démarches et justificatifs du compte authentifié, utilise l'OCR si nécessaire, construit un contexte personnel à partir des données accessibles du compte, demande une réponse dans la langue de la question, et enregistre/relit/renomme/supprime les conversations du seul utilisateur.

### Administration et persistance

- **`AgentService`** : fournit les statistiques de préfecture et la file des demandes ; applique les transitions de traitement, validation, approbation, rejet ou demande d'informations ; gère les paramètres, modèles PDF et marques officielles.
- **`official-mark-image.ts`** : prépare les images de cachet/signature pour produire un PNG transparent avant aperçu ou usage PDF.
- **`PrismaService`** : encapsule le client de base de données, se connecte au démarrage et ferme proprement la connexion à l'arrêt.
- **`AppController`** : expose la route de santé `GET /health`.

## 4. Principales routes HTTP

Les routes exactes sont définies par les contrôleurs NestJS et leurs DTO. Les principaux groupes sont :

| Préfixe | Rôle |
|---|---|
| `/auth` | Inscription, connexion, fermeture/validation de session, réinitialisation de mot de passe, profil et langue. |
| `/users` | Profil et administration des comptes ; opérations réservées aux rôles autorisés. |
| `/requests` | Catalogue, exigences, tarifs, statistiques personnelles, démarches, pièces et PDF. |
| `/payments` | Initiation de paiement de démonstration et paiements du compte courant. |
| `/appointments` | Disponibilités publiques authentifiées, rendez-vous personnels, tickets et administration protégée. |
| `/complaints` | Réclamations du citoyen, justificatifs et routes d'administration protégées. |
| `/notifications` | Notifications du compte connecté et marquage comme lu. |
| `/documents` | Gestion administrative du fonds ; routes de publication selon les rôles configurés. |
| `/rag` | Recherche IA personnelle (`POST /search`), question à l'assistant (`POST /ask`) et historique personnel. |
| `/admin` | Paramètres, modèles, cachets/signatures, statistiques et traitements administratifs. |
| `/health` | Vérification minimale de disponibilité du backend. |

## 5. Règle d'isolation appliquée à l'assistant IA

1. `AuthGuard` valide la session et le backend prend l'identifiant utilisateur de cette session ; le client ne peut pas choisir l'identité à consulter.
2. Les demandes, rendez-vous, paiements, réclamations, notifications, profil et conversations chargés pour le chat portent un filtre correspondant à cet identifiant.
3. Les conversations fournies au chat sont revérifiées par rapport à leur propriétaire. Les requêtes de recherche personnelle n'interrogent pas le fonds Qdrant global ni les dossiers d'autres citoyens.
4. Seules les données nécessaires et sélectionnées côté serveur sont envoyées au modèle. Les secrets d'authentification et codes de réinitialisation ne font pas partie du contexte.
5. Une réponse sur les données personnelles doit être fondée sur le contexte de ce compte. Si une donnée n'est pas disponible, l'assistant doit l'indiquer plutôt que l'inventer ou la demander à un autre compte.
6. Une donnée publique ou une règle générale sur les services peut être expliquée, mais ne doit jamais servir de passerelle vers une donnée privée appartenant à une autre personne. Les opérations administratives générales restent distinctes du chat individuel.

Cette isolation doit être vérifiée par des tests d'intégration avec au moins deux comptes et des données reconnaissables différentes, y compris pour les appels de recherche, de réponse, d'historique, de source et les requêtes avec identifiant de conversation modifié.

## 6. Langue des réponses IA

- La langue de la question est déterminée à partir d'indices lexicaux de français et de malgache ; le paramètre de langue du compte sert uniquement de repli lorsque la question est ambiguë.
- Une question formulée en malgache reçoit une réponse en malgache clair et naturel ; une question en français reçoit une réponse en français. Une demande explicite de langue dans la question prévaut.
- Les deux versions doivent conserver les mêmes faits, dates, nombres, étapes, conditions et conclusion. Les noms officiels, références et codes peuvent rester inchangés ; les explications, titres et consignes doivent être dans la langue retenue.
- Valider la reconnaissance sur des questions françaises, malgaches, mixtes et ambiguës, ainsi que la cohérence factuelle entre les deux formulations d'une même question.

## 7. Limites et décisions de déploiement

- L'étendue effective de données incluses dans un contexte dépend des sélections et limites explicites du service ; une réponse ne doit pas laisser croire qu'elle a analysé des données non chargées.
- La présence du code client ne garantit pas à elle seule la configuration des services OCR, IA, SMTP, Qdrant, des opérateurs de paiement ou du stockage dans chaque environnement.
- Les rôles d'administration autorisent les opérations métier prévues, mais ne changent pas la portée privée d'une conversation IA de compte.
