# Cahier des charges technique — e-Servisy d'Ihosy

## 1. Objet et statut

Ce document traduit le cahier des charges fonctionnel en exigences d'architecture, d'API, de données, de sécurité et de validation pour e-Servisy d'Ihosy.

Il décrit la cible technique cohérente avec le dépôt actuel. Il ne constitue pas une preuve de déploiement en production. Les exigences sont à vérifier dans l'environnement de recette, et les décisions indiquées comme à confirmer doivent être validées par les responsables métier et techniques.

## 2. Périmètre applicatif

Le système comprend :

- une interface web citoyenne et une interface d'administration ;
- une API métier authentifiée ;
- une base relationnelle pour les comptes, demandes, pièces, rendez-vous, statuts, conversations et métadonnées ;
- un stockage de fichiers pour les justificatifs, archives et ressources officielles ;
- des services de traitement de texte, OCR, embeddings et génération de réponses ;
- une base vectorielle pour la recherche sémantique du fonds documentaire.

Ne sont pas considérées comme acquises sans intégration et recette : connexion réelle aux opérateurs de paiement, engagement de disponibilité/SLA, mécanisme complet de sauvegarde/restauration ou OCR correct sur toutes les catégories de scans.

## 3. Architecture et technologies

### 3.1 Composants constatés dans le dépôt

| Composant | Technologie |
|---|---|
| Interface | React, TypeScript, Vite, React Router, TanStack Query |
| API métier | Node.js, NestJS, TypeScript |
| Accès aux données | Prisma ORM |
| Base relationnelle | PostgreSQL |
| Recherche vectorielle | Qdrant |
| Service IA | Python, FastAPI ; OCR, embeddings et génération selon configuration |
| Modèle local | Ollama selon la configuration de l'environnement |
| Traitement d'images | Sharp pour extraction et normalisation PNG |
| Génération de PDF | PDFKit |
| Exécution locale | Docker Compose |

Les fichiers sont stockés dans le volume d'uploads du backend dans le déploiement Compose actuel. MinIO est déclaré dans l'infrastructure, mais son utilisation comme stockage effectif des fichiers métier doit être validée avant d'être considérée comme un prérequis réalisé.

### 3.2 Principes d'architecture

- Le navigateur communique avec l'API NestJS en JSON et multipart pour les dépôts de fichiers.
- L'API est l'autorité pour l'authentification, les autorisations, les transitions de statuts et la sélection des données.
- PostgreSQL conserve les données métier structurées et l'OCR persistant des pièces de dossier.
- Qdrant sert à la recherche vectorielle du fonds documentaire ; une recherche textuelle exacte doit également exister là où le cas d'usage l'exige.
- Le service IA reste un composant séparé ; une erreur de ce service doit être distinguée d'une absence de résultat.
- Les PDF sont produits par l'API à partir des données autorisées et des ressources disponibles.

## 4. Exigences fonctionnelles techniques

### 4.1 Authentification et autorisation

- Chaque route non publique valide l'identité du compte connecté.
- Les opérations d'administration exigent le rôle approprié, contrôlé côté serveur.
- Les services vérifient la propriété du dossier et de la pièce ; masquer un bouton côté frontend ne constitue pas une protection.
- Le citoyen ne peut accéder qu'à ses dossiers, pièces, tickets, conversations et documents délivrés.
- L'accès global au fonds administratif est limité aux rôles habilités et aux documents publiables.
- Les identifiants de ressource fournis par le client doivent être vérifiés par rapport au compte et au rôle avant toute lecture ou modification.
- Les erreurs d'autorisation ne doivent pas divulguer les données du propriétaire d'une ressource.

### 4.2 Demandes et pièces jointes

- Persister le type, le propriétaire, le service, le statut, les données de formulaire, l'historique, les paiements et les pièces associées.
- Valider côté serveur les champs, formats, limites de taille, types MIME et pièces obligatoires propres au type de démarche.
- Conserver le nom d'origine, le type de contenu, le chemin de stockage et la taille des fichiers.
- Les fichiers acceptés par les règles actuelles comprennent PDF, JPEG et PNG ; appliquer les limites configurées aux routes de dépôt.
- À la création ou au remplacement d'une pièce, remettre à zéro le texte OCR précédent, puis enregistrer uniquement le texte extrait du nouveau fichier.
- L'extraction OCR doit être asynchrone par rapport à la soumission du dossier, bornée en concurrence et journalisée en cas d'échec ; elle ne doit pas bloquer ou invalider une demande métier déjà créée.
- Éviter d'écrire les contenus sensibles des fichiers ou les données personnelles complètes dans les logs.
- Les transitions de statut doivent être validées et inscrites dans l'historique.

### 4.3 Recherche dans les documents personnels via le chat

- Le contrôleur transmet au service RAG l'identifiant du compte authentifié ; l'identifiant ne doit pas provenir du texte de la question ou d'un champ choisi librement par le navigateur.
- Une intention de recherche documentaire exacte (ex. « quels documents contiennent le mot X ? ») doit d'abord interroger les demandes du seul compte connecté.
- Les champs de formulaire sont recherchés textuellement ; les pièces PDF/images sont recherchées dans le champ OCR persistant `RequestAttachment.extractedText`.
- Pour les anciennes pièces sans OCR, le serveur peut lancer l'OCR à la demande, de manière bornée, puis persister le résultat. Une indisponibilité ou un fichier inaccessible doit être signalé comme limite et journalisé.
- Les résultats mentionnent le titre/service, le statut et les pièces correspondantes sans exposer le chemin de stockage ni le texte intégral non nécessaire.
- Les recherches du citoyen n'interrogent pas globalement les pièces des autres citoyens.
- Les recherches générales dans le fonds de la Préfecture restent séparées et soumises aux droits de consultation applicables.
- Enregistrer la question/réponse dans la conversation du compte, en ne persistant comme sources que les identifiants de chunks réellement liés à ceux-ci.
- Ajouter des tests d'autorisation : deux comptes avec données distinctes, absence de fuite croisée, recherche exacte trouvée/non trouvée, OCR manquant, fichier manquant et service OCR indisponible.

### 4.4 Recherche du fonds et génération IA

- Conserver les métadonnées et chunks dans PostgreSQL ; indexer les vecteurs dans Qdrant avec identifiants de document et contenu nécessaire au résultat.
- La recherche lexicale doit pouvoir compléter la recherche sémantique ; une panne de Qdrant ne doit pas être transformée silencieusement en réponse certaine.
- Les réponses doivent être fondées sur le contexte disponible, rester dans le domaine préfectoral et ne pas inventer de pièces, tarifs ou règles.
- Les réponses doivent identifier ou restituer leurs sources lorsque des sources existent.
- En cas de contexte absent ou d'incertitude, répondre explicitement qu'aucun document pertinent n'a été trouvé ou demander une précision.
- L'assistant ne réalise pas de décision métier et ne modifie pas directement le statut d'un dossier.

### 4.5 Rendez-vous et ticket PDF

- Persister une référence de ticket stable sur le rendez-vous et l'attribuer dans une transaction sérialisée ou protégée contre les accès concurrents.
- Format de référence : `RDV-NNN-J`, où `NNN` est le compteur de la journée, avec remise à `001` au changement de jour local (fuseau `Indian/Antananarivo`) et `J` le jour du mois sans zéro initial.
- Une réservation annulée conserve son numéro ; une nouvelle réservation incrémente la séquence de la date de rendez-vous concernée.
- Valider la disponibilité et l'absence de conflit à la réservation ; prendre en charge à la fois les rendez-vous citoyens et les rendez-vous de prise d'empreintes attribués par l'administration.
- Générer le ticket uniquement pour les statuts autorisés. Le PDF contient la référence, le citoyen, le motif, la date, les heures, le guichet et les marques officielles applicables.
- Le nom de téléchargement est dérivé du titre de la demande ou du nom du service ; utiliser un slug de fichier sûr, avec extension `.pdf`.
- Exposer `Content-Disposition` au frontend via CORS lorsqu'il lit le nom du fichier dans l'en-tête.
- Le back-office permet le filtrage combiné par date locale et référence.
- Tester la séquence en concurrence, le passage au jour suivant, les annulations, la réservation CIN, l'autorisation du téléchargement et le nom de fichier.

### 4.6 Cachets, signatures et PDF

- Accepter les images autorisées selon la taille configurée et décoder par Sharp, sans faire confiance uniquement à l'extension.
- Normaliser l'orientation EXIF, la couleur en sRGB et la transparence ; retourner un PNG.
- Produire l'aperçu et enregistrer le même résultat traité après confirmation ; ne pas stocker par défaut l'original si l'utilisateur a confirmé l'image numérisée.
- Détecter les longues lignes horizontales et verticales du papier et les éliminer tout en préservant autant que possible les traits d'encre aux intersections.
- Supprimer le fond clair et recadrer autour de l'encre avec un padding réduit.
- Renvoyer une erreur lisible lorsque l'entrée ne peut pas être décodée ou lorsqu'aucune encre exploitable n'est détectée.
- Envoyer les octets du PNG d'aperçu directement avec `Content-Type: image/png`.
- Dans chaque générateur PDF concerné, décoder les fichiers historiques et les normaliser en PNG avant de les transmettre à PDFKit ; une image invalide produit une erreur explicite.
- Le réglage de position du cachet doit le rapprocher de la signature sans changer la position de la signature.
- Valider le pipeline sur des images RGB et RGBA, papier blanc, lignes de cahier, intersections d'encre, image vide, cachet JPEG historique, PNG transparent, aperçu HTTP et document final.

### 4.7 Documents administratifs et PDF délivrés

- Générer un PDF seulement si la demande et l'appelant satisfont les règles d'accès et le statut métier.
- Exclure les demandes dont le document doit être remis au guichet plutôt que téléchargé, si cette règle est applicable au type.
- Choisir les cachets/signatures actifs de façon déterministe (les éléments actifs les plus récents selon les règles applicables).
- N'avaler aucune erreur PDF/image de façon silencieuse ; retourner un message de service explicite sans inclure de données sensibles.

### 4.8 API et interface

- Maintenir des DTO avec validation côté backend pour les entrées externes et des types explicites côté frontend.
- Les appels longs affichent les états chargement, réussite et erreur ; les erreurs de téléchargement doivent préserver le message serveur lorsque cela est sûr.
- Les routes de liste doivent rester paginables ou limitées lorsque le volume le justifie.
- Ne jamais utiliser un repli qui transforme une erreur technique en réponse d'apparence réussie.
- Les fichiers téléchargés doivent utiliser le nom du serveur lorsqu'il est disponible et un repli sûr sinon.

## 5. Modèle de données concerné

Les principales entités relationnelles sont :

- `User`, rôles et statuts de compte ;
- `PrefectureService`, `ServiceRequest`, `RequestAttachment`, `RequestStatusHistory` et `Payment` ;
- `Appointment`, `AppointmentSlot` et `AppointmentAvailability` ;
- `CitizenComplaint` et notifications ;
- `DocumentAdministratif`, `Chunk`, `Categorie` et `JournalAudit` ;
- `OfficialMark`, `DocumentTemplate` et `PlatformSetting` ;
- `ChatConversation`, `RequeteUtilisateur` et `RequeteSource`.

Les champs décrits dans le schéma Prisma constituent la référence d'implémentation. Toute évolution de schéma doit être accompagnée d'une migration versionnée et appliquée dans tous les environnements.

## 6. Exigences non fonctionnelles

### Sécurité et confidentialité

- Utiliser HTTPS dans les environnements exposés ; ne pas publier les mots de passe ou secrets dans le code ou les logs.
- Stocker les mots de passe sous forme de hash adapté ; appliquer une validation robuste aux fichiers et entrées utilisateur.
- Contrôler les autorisations au niveau API et service métier, et limiter les sorties aux champs nécessaires.
- Protéger les fichiers par des chemins non devinables et une vérification de propriété avant téléchargement.
- Définir avec la Préfecture les durées de conservation, les règles de suppression, les politiques de sauvegarde et les obligations applicables aux données personnelles.

### Fiabilité et observabilité

- Journaliser les erreurs OCR, RAG, base vectorielle et PDF avec identifiants techniques, sans contenu personnel superflu.
- Distinguer « aucun résultat » d'une erreur de dépendance.
- Prévoir des contrôles de santé des services et une procédure de reprise ; les objectifs de disponibilité et de reprise restent à contractualiser.
- Éviter qu'un travail OCR en arrière-plan génère une concurrence non bornée ou des erreurs non observées.

### Compatibilité et accessibilité

- Supporter les navigateurs récents et les tailles d'écran usuelles.
- Rendre les libellés, états, champs obligatoires et erreurs perceptibles au clavier et aux lecteurs d'écran.
- Maintenir le français et le malagasy pour les parcours et messages pris en charge.

## 7. Interfaces principales

Les noms exacts restent définis par les contrôleurs et DTO de la version livrée. Les domaines d'API comprennent :

- authentification, profil, rôles et comptes ;
- demandes, exigences, pièces, documents PDF délivrés et réclamations ;
- rendez-vous, disponibilités, créneaux, statuts et tickets ;
- documents administratifs, indexation et recherche ;
- questions RAG, conversations et historique ;
- paramètres, modèles et cachets/signatures administratifs.

Les contrats HTTP de production devront être documentés et versionnés lorsqu'ils seront stabilisés. Les événements d'erreur doivent utiliser des codes HTTP adaptés et des messages non sensibles.

## 8. Stratégie de validation et critères d'acceptation

### Tests automatisés et contrôles

- `npm run build` réussit dans `apps/backend` et `apps/frontend`.
- `npx prisma validate` réussit ; les migrations sont applicables sur une base vierge et sur une base contenant des données de référence.
- Tests unitaires pour les règles de référence quotidienne, extraction d'intention de recherche, normalisation de texte, séparation des lignes et messages de non-détection.
- Tests d'intégration pour droits, transitions métier, création de dossier, OCR, génération PDF, références, filtres admin et isolation entre comptes.
- Tests frontend des formulaires, états d'erreur, téléchargement et visualisation de l'image numérisée.

### Recette métier

- Chaque rôle ne peut exécuter que ses opérations autorisées.
- Un citoyen ne peut jamais consulter les ressources d'un autre compte.
- Les pièces attendues et règles d'une démarche sont cohérentes avec les règles approuvées par la Préfecture.
- Les recherches exactes et sémantiques ne confondent pas absence de résultat et indisponibilité d'un service.
- Les références de rendez-vous suivent le compteur quotidien attendu, y compris sous réservations concurrentes.
- Le ticket contient des données exactes et son fichier est nommé d'après la démarche.
- Une image numérisée fournit un vrai PNG transparent, lisible dans l'aperçu et intégré sans erreur aux PDF.
- Le cachet est proche de la signature et la position de la signature reste inchangée.

## 9. Configuration, déploiement et exploitation

- Conserver les secrets et paramètres d'environnement en dehors des dépôts de code.
- Versionner les migrations Prisma et les appliquer avant d'exécuter une version backend qui dépend d'un nouveau champ.
- Reconstruire et redémarrer les images backend après modification du code ; vérifier ensuite la santé de l'API et les logs.
- Monter les volumes persistants requis pour PostgreSQL, fichiers utilisateurs et services d'indexation.
- Documenter les procédures de sauvegarde/restauration et vérifier périodiquement leur efficacité avant mise en production.
- Les migrations nécessaires à la présente cible incluent notamment la référence de ticket et le texte OCR persisté sur les pièces jointes ; confirmer qu'elles sont appliquées dans l'environnement concerné.

## 10. Hypothèses et décisions à confirmer

1. Le propriétaire métier confirme la liste finale des démarches, les champs, les pièces, tarifs et transitions.
2. La Préfecture confirme le fuseau horaire, le format quotidien de référence et la gestion des rendez-vous replanifiés.
3. Le responsable sécurité confirme l'hébergement des modèles, les politiques de conservation et les exigences locales de confidentialité.
4. L'exploitant confirme les moteurs OCR présents dans chaque environnement ainsi que les limites de formats et de taille.
5. Le responsable métier confirme quels documents officiels peuvent être publiés aux citoyens et lesquels sont réservés aux agents.
6. Le stockage effectif des fichiers (volume local ou MinIO) doit être choisi et documenté pour le déploiement cible.
7. Les objectifs de performance, disponibilité, sauvegarde et reprise doivent être fixés avant engagement de production.
