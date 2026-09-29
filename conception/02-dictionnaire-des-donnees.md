# 2. Dictionnaire des données

| Domaine | Donnée | Description | Source / format |
|---|---|---|---|
| Utilisateur | `id` | Identifiant unique du compte | UUID |
| Utilisateur | `email` | Identifiant de connexion et contact | Email unique |
| Utilisateur | `nom` | Nom affiché du compte | Texte facultatif |
| Utilisateur | `phone` | Numéro de téléphone | Texte unique si renseigné |
| Utilisateur | `cin` | Numéro de carte d'identité | 12 chiffres si renseigné |
| Utilisateur | `role` | CITIZEN, ADMIN ou SUPERADMIN | Enum |
| Utilisateur | `status` | Etat du compte | Enum |
| Demande | `id` | Identifiant du dossier | UUID |
| Demande | `type` | Type de démarche parmi les 18 services | Enum |
| Demande | `status` | Etat d'instruction | Enum |
| Demande | `formData` | Données propres au formulaire | JSON |
| Demande | `fee` | Montant à payer | Decimal |
| Demande | `adminHidden` | Masquage de la vue admin | Booléen |
| Pièce | `originalName` | Nom original du fichier | Texte |
| Pièce | `storagePath` | Chemin de stockage local | Texte |
| Rendez-vous | `startsAt`, `endsAt` | Créneau de 30 minutes | Date/heure |
| Notification | `title`, `message` | Information envoyée au citoyen | Texte |
| Paiement | `provider`, `amount`, `phone` | Opérateur, prix et téléphone | Enum, Decimal, Texte |
| Document | `titre`, `reference`, `contenuTexte` | Archive officielle indexée | Texte |
| Modèle | `requestType`, `name`, `isActive` | Modèle par type, version active | Enum, Texte, Booléen |
| Paramètre | `key`, `value` | Tarif et limite des demandes | Texte |
| Requête IA | `texte`, `reponseGeneree` | Question et réponse sourcée | Texte |
