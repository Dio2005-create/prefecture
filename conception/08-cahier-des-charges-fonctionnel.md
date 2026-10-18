# Cahier des charges fonctionnel — e-Servisy d'Ihosy

## 1. Objet du document

Ce cahier des charges décrit, sans prérequis informatique, les services attendus de la plateforme e-Servisy d'Ihosy. Il s'adresse aux responsables de la Préfecture, aux agents, aux citoyens et à toute personne chargée de valider les besoins métier.

Il complète les règles de gestion et les modèles Merise déjà présents dans ce dossier. Les règles administratives et tarifaires restent celles validées par la Préfecture.

## 2. Contexte et objectifs

La plateforme doit faciliter les échanges entre les citoyens et la Préfecture d'Ihosy. Elle rassemble dans un même service en ligne les démarches, les pièces justificatives, le suivi des dossiers, les rendez-vous et l'accès aux informations administratives.

Les objectifs sont de :

- rendre les démarches plus accessibles, y compris à distance ;
- aider les citoyens à préparer et transmettre un dossier complet ;
- permettre aux agents autorisés d'instruire les demandes et d'en tracer les décisions ;
- informer le citoyen de l'avancement de son dossier ;
- simplifier l'organisation des rendez-vous et la remise de tickets ;
- faciliter la consultation des documents administratifs et des archives ;
- proposer une aide en français et en malagasy, sans remplacer la décision d'un agent.

## 3. Personnes concernées et droits

### Citoyen

Le citoyen crée et gère son compte, dépose ses démarches, transmet des justificatifs, consulte ses propres dossiers et rendez-vous, reçoit des notifications et télécharge les documents qui lui sont accessibles. Il ne peut consulter ni modifier les dossiers d'un autre citoyen.

### Administrateur / agent habilité

L'agent consulte les dossiers nécessaires à son travail, instruit les demandes, demande des compléments, valide ou refuse selon ses habilitations, traite les réclamations et gère les rendez-vous, les créneaux et les éléments officiels nécessaires aux documents.

### Superadministrateur

Le superadministrateur dispose des fonctions d'administration supplémentaires prévues par l'application, notamment la création de comptes administrateurs.

Les opérations et informations accessibles doivent dépendre du compte connecté et de ses droits. Une adresse ou un identifiant d'écran ne suffit jamais à autoriser l'accès à un dossier.

## 4. Périmètre fonctionnel

### 4.1 Compte et accès

- Créer un compte citoyen et se connecter de manière sécurisée.
- Consulter et modifier les informations de profil autorisées.
- Gérer les préférences de langue disponibles.
- Permettre les fonctions de récupération de compte prévues par l'application.
- Présenter à chaque profil uniquement les écrans et actions autorisés.

### 4.2 Démarches administratives

- Présenter les démarches proposées par la Préfecture.
- Afficher pour chaque démarche les informations, champs et justificatifs attendus.
- Permettre au citoyen de remplir le formulaire, transmettre les pièces demandées et soumettre son dossier.
- Vérifier les informations et les pièces obligatoires avant soumission, notamment le format attendu du numéro CIN lorsqu'il est demandé.
- Afficher l'état de traitement du dossier et les demandes de complément.
- Permettre aux agents habilités d'examiner les dossiers, de consigner les changements d'état, de demander des informations complémentaires, puis de valider ou refuser une demande selon les règles applicables.
- Conserver l'historique utile des décisions et des échanges.
- Permettre au citoyen de télécharger le document délivré lorsque sa demande est approuvée et que le type de démarche le permet.

Les démarches couvertes comprennent les actes de naissance, certificats de résidence et de nationalité, demandes et renouvellements de CIN, certificat de bonne vie et mœurs, permis de construire, situation foncière, licence commerciale, immatriculation de véhicule, déclaration de perte, légalisation de signature, réclamation, demande particulière, déclaration d'association, autorisation de manifestation, agrément et autorisation administrative.

Les justificatifs, frais et conditions exacts sont ceux configurés et validés par la Préfecture ; ils ne doivent pas être inventés par l'assistant.

### 4.3 Rendez-vous

- Afficher les dates et horaires ouverts par l'administration.
- Laisser le citoyen réserver un créneau disponible et annuler un rendez-vous lorsque son état le permet.
- Empêcher la double réservation d'un créneau et respecter les horaires et pauses configurés.
- Permettre à l'administration de confirmer, refuser ou clôturer un rendez-vous selon son état.
- Envoyer les notifications de confirmation et les informations de rendez-vous prévues.
- Fournir au citoyen un ticket PDF après confirmation, avec la date, l'heure, le guichet, le motif, le nom et une référence lisible.
- Attribuer une référence quotidienne de la forme `RDV-001-18` (jour du mois), puis `RDV-002-18`, etc. Le compteur repart à `001` au jour local suivant.
- Permettre à l'administration de retrouver un rendez-vous par sa date ou par sa référence.
- Nommer le fichier PDF téléchargé d'après la démarche associée lorsqu'elle existe, et non avec un identifiant technique seul.

Les rendez-vous liés à la prise d'empreintes de CIN suivent le parcours particulier défini par la Préfecture et peuvent être attribués par l'administration.

### 4.4 Documents, archives et recherche

- Permettre aux agents autorisés de déposer et consulter les documents administratifs du fonds.
- Enregistrer les informations utiles au classement, par exemple le titre, la référence, le type, la date et le service émetteur.
- Permettre une recherche par mots-clés et une recherche en langage naturel dans les documents accessibles.
- Présenter des extraits et l'identité des sources utilisées, lorsque disponibles.
- Permettre au citoyen d'accéder à ses propres documents délivrés et de les télécharger.
- Dans l'assistant citoyen, répondre directement aux recherches explicites dans les dossiers et pièces du compte connecté. La recherche d'un mot exact doit pouvoir retrouver le texte OCR d'une pièce lisible sans imposer l'ouverture de l'écran de recherche sémantique.
- Ne jamais inclure dans une réponse citoyenne les dossiers ou pièces d'un autre compte.

### 4.5 Assistant

- Accepter des questions sur les démarches, documents, rendez-vous et services de la Préfecture.
- Répondre en français ou en malagasy en fonction de la question.
- Utiliser les informations administratives disponibles et les sources pertinentes.
- Distinguer une information trouvée d'une information absente ; ne pas inventer de condition, de frais ou de pièce.
- Conserver l'historique des conversations du compte et ne pas rendre les conversations d'un autre compte accessibles.
- Orienter vers le service compétent lorsque la réponse ne peut pas être établie.
- Ne pas se substituer à l'agent pour une décision administrative.

### 4.6 Réclamations et notifications

- Permettre au citoyen de déposer une réclamation liée à un document délivré et d'y joindre un justificatif.
- Permettre à l'administration d'examiner, résoudre ou rejeter une réclamation et de communiquer sa réponse.
- Informer le citoyen des événements importants : dépôt, changement d'état, rendez-vous et réponse à une réclamation.

### 4.7 Paramétrage administratif

- Permettre aux rôles autorisés de gérer les utilisateurs, paramètres et informations configurables prévus par l'application.
- Permettre la gestion des horaires, créneaux, modèles de documents, frais configurables, cachets et signatures.
- Afficher les indicateurs de suivi prévus dans l'espace administratif.
- Garder une trace des opérations métier pertinentes.

### 4.8 Cachets et signatures

- Permettre à un administrateur d'importer une image de signature ou de cachet, d'en visualiser l'extraction et de confirmer son enregistrement.
- Retirer autant que possible le papier clair, les ombres légères et les lignes droites de cahier, conserver l'encre détectée, rendre le fond transparent et recadrer l'image avec une petite marge.
- Fournir un aperçu suffisamment grand pour contrôler la numérisation avant validation.
- Utiliser les éléments officiels actifs sur les PDF concernés. Le cachet doit apparaître près de la signature ; la position de la signature ne doit pas être modifiée par ce réglage.
- Signaler clairement une image invalide ou une extraction sans encre exploitable.

La numérisation automatique aide à préparer l'image ; l'administrateur demeure responsable de vérifier l'aperçu avant enregistrement.

## 5. Exigences de qualité de service

- L'interface doit être utilisable sur ordinateur et sur les écrans mobiles courants.
- Les textes, erreurs et confirmations doivent être compréhensibles et cohérents.
- Les opérations de transmission de formulaire ou de pièce doivent indiquer leur progression et leur résultat.
- Les téléchargements ne doivent être proposés que lorsque les documents sont disponibles et autorisés.
- En cas d'indisponibilité d'un traitement automatique, le service doit signaler le problème sans afficher une réponse comme si le traitement avait réussi.
- Les décisions administratives restent sous contrôle humain.

## 6. Parcours d'acceptation représentatifs

1. Un citoyen se connecte, sélectionne une démarche, complète les champs et les justificatifs, puis soumet son dossier.
2. Un agent autorisé consulte le dossier, le fait évoluer ou demande un complément ; le citoyen voit l'état actualisé et reçoit l'information prévue.
3. Après approbation, le citoyen télécharge le document délivré lorsque la démarche le permet.
4. Un citoyen réserve un créneau libre ; l'administration le confirme ; le citoyen télécharge un ticket PDF avec référence quotidienne et renseignements exacts.
5. Un agent recherche un ticket par date ou par référence et retrouve le rendez-vous correspondant.
6. Un citoyen demande dans le chat quels documents de son compte contiennent un mot précis ; la réponse liste uniquement ses demandes/pièces correspondantes et indique si certaines pièces n'ont pas pu être lues.
7. Un administrateur téléverse une signature ou un cachet, vérifie un aperçu lisible et assez grand, puis retrouve l'image correctement intégrée dans un PDF généré.
8. Un citoyen ne peut, même en manipulant une adresse de requête, lire le dossier, les pièces ou l'historique d'un autre compte.

## 7. Limites et éléments à valider par la Préfecture

Les montants, pièces obligatoires, règles de décision, durées de conservation et modalités de publication relèvent de la Préfecture. Ils doivent être confirmés par les responsables métier avant mise en production.

Le paiement décrit dans la documentation existante est une simulation et ne doit pas être présenté comme une intégration effective à un opérateur tant que celle-ci n'est pas réalisée et validée.

La lecture OCR dépend de la qualité des scans et des services configurés. Les documents illisibles doivent pouvoir être signalés et repris par un agent.

La liste des écrans et comportements doit être vérifiée dans l'environnement de recette. Une fonction décrite comme cible ne doit pas être annoncée comme opérationnelle avant son test et sa validation.
