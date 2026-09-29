# Conception du Système de Modernisation & Gestion Documentaire Intelligente

**Thème :** Conception et mise en œuvre d'un système de classification et de recherche sémantique des archives administratives fondé sur les modèles LLM/RAG (Retrieval-Augmented Generation)

**Objectif :** Numériser, catégoriser et interroger les actes administratifs, arrêtés et courriers de la préfecture en langage naturel.

---

## 1. Contexte et problématique

Les préfectures et administrations publiques génèrent un volume important de documents (actes administratifs, arrêtés, courriers) généralement archivés sous forme papier ou en fichiers numériques non structurés (scans, PDF). Cette situation pose plusieurs problèmes :

- **Recherche difficile** : retrouver un document précis nécessite une connaissance exacte de son classement (date, service émetteur, référence).
- **Absence de recherche sémantique** : un agent ne peut pas poser une question en langage naturel ("quels arrêtés concernent l'urbanisme en 2023 ?") — il doit connaître les mots-clés exacts.
- **Confidentialité** : les données administratives sont sensibles et ne peuvent généralement pas transiter par des services cloud externes (RGPD/souveraineté des données).
- **Volumétrie croissante** : les archives papier s'accumulent sans système de classification automatique.

Le projet propose de répondre à ces problèmes par un système combinant **numérisation (OCR)**, **classification automatique**, et **recherche sémantique via RAG local**, afin de garantir à la fois pertinence des résultats et confidentialité des données.

---

## 2. Objectifs du système

| Objectif | Description |
|---|---|
| O1 | Numériser les documents papier via OCR |
| O2 | Extraire les métadonnées (date, type d'acte, service, objet) automatiquement |
| O3 | Classer/catégoriser les documents selon une taxonomie administrative |
| O4 | Vectoriser le contenu pour permettre une recherche sémantique |
| O5 | Permettre l'interrogation en langage naturel (question/réponse sur le fonds documentaire) |
| O6 | Garantir la confidentialité via un traitement LLM local (pas d'envoi vers des API externes) |
| O7 | Fournir une interface web d'administration et de recherche |

---

## 3. Acteurs et cas d'utilisation

### 3.1 Acteurs

- **Agent administratif** : dépose, consulte et recherche des documents.
- **Archiviste / gestionnaire documentaire** : valide la classification, corrige les métadonnées, gère la taxonomie.
- **Administrateur système** : gère les utilisateurs, les droits d'accès, la supervision du système IA.
- **Système IA (acteur non humain)** : OCR, extraction, classification, indexation vectorielle.

### 3.2 Cas d'utilisation principaux

```
UC1  - Importer un document (scan / upload)
UC2  - Lancer l'OCR et l'extraction de métadonnées
UC3  - Valider / corriger la classification proposée
UC4  - Rechercher un document par mots-clés (recherche classique)
UC5  - Interroger le fonds documentaire en langage naturel (RAG)
UC6  - Consulter l'historique et la traçabilité d'un document
UC7  - Gérer la taxonomie de classification
UC8  - Gérer les droits d'accès par service/rôle
UC9  - Exporter un document ou un dossier
UC10 - Superviser les traitements IA (logs, statuts d'indexation)
```

### 3.3 Diagramme de cas d'utilisation (description textuelle)

```
                     ┌────────────────────────────┐
   Agent ────────────▶  UC1 Importer document      │
   Admin.             │  UC4 Recherche classique    │
                       │  UC5 Recherche sémantique   │
                       │  UC6 Consulter historique   │
                       └────────────────────────────┘

   Archiviste ─────────▶ UC3 Valider classification
                         UC7 Gérer taxonomie
                         UC9 Exporter document

   Admin système ───────▶ UC8 Gérer droits d'accès
                          UC10 Superviser traitements IA

   Système IA (acteur) ─▶ UC2 OCR + extraction
                          (inclus dans UC1)
```

---

## 4. Architecture générale du système

Le système est structuré en **quatre couches** :

```
┌───────────────────────────────────────────────────────────────┐
│                     COUCHE PRÉSENTATION                        │
│   Application Web React (recherche, dépôt, administration)     │
└───────────────────────────────┬─────────────────────────────────┘
                                  │ REST / JSON (HTTPS)
┌───────────────────────────────▼─────────────────────────────────┐
│                    COUCHE APPLICATIVE (Backend)                 │
│   API NestJS : Auth, gestion documents, droits, orchestration   │
└─────────────┬──────────────────────────────────┬─────────────────┘
               │                                    │
      ┌────────▼─────────┐              ┌───────────▼───────────┐
      │  COUCHE IA / RAG   │              │  COUCHE PERSISTANCE   │
      │  Service Python     │              │  PostgreSQL + Qdrant │
      │  (FastAPI)           │              │  Stockage fichiers    │
      │  OCR, embeddings,    │              │  (MinIO / disque)     │
      │  LLM local (Ollama)  │              └────────────────────────┘
      └───────────────────────┘
```

### 4.1 Justification des choix d'architecture

- **Séparation backend métier / backend IA** : le traitement NLP (OCR, embeddings, inférence LLM) est isolé dans un microservice Python car l'écosystème IA (Hugging Face, LangChain, sentence-transformers) y est plus mature qu'en Node.js. Cela permet aussi de faire évoluer indépendamment la partie IA (changement de modèle, GPU dédié) sans toucher au backend métier.
- **RAG local** : conformément à l'exigence de confidentialité, le LLM tourne en local via **Ollama**, évitant tout transit de données sensibles vers un service tiers.
- **Base vectorielle dédiée (Qdrant)** : plus performante que pgvector pour la recherche approximative à grande échelle (ANN — Approximate Nearest Neighbor), tout en restant déployable on-premise.

---

## 5. Architecture technique détaillée

### 5.1 Frontend

| Élément | Technologie | Justification |
|---|---|---|
| Framework | React 18 + TypeScript | Typage fort, écosystème riche |
| Style | Tailwind CSS + shadcn/ui | Rapidité de développement, cohérence visuelle |
| Gestion des requêtes | TanStack Query | Cache, synchronisation, gestion des états de chargement |
| Formulaires | React Hook Form + Zod | Validation typée des formulaires de dépôt/métadonnées |
| Recherche | Composant de recherche hybride (mots-clés + sémantique) avec affichage des extraits pertinents surlignés |
| Authentification | JWT (access + refresh token) stocké en cookie httpOnly |

### 5.2 Backend applicatif (NestJS)

Modules principaux :

- **AuthModule** : authentification JWT, gestion des rôles (RBAC).
- **DocumentModule** : upload, métadonnées, cycle de vie du document (brouillon → en cours de traitement → validé → archivé).
- **TaxonomyModule** : gestion de la classification (types d'actes, services, catégories).
- **SearchModule** : orchestration de la recherche (appel au service IA, fusion des résultats).
- **AuditModule** : traçabilité (qui a consulté/modifié quoi, horodatage).
- **UserModule** : gestion des utilisateurs et des permissions par service.

### 5.3 Service IA / RAG (Python + FastAPI)

Pipeline de traitement d'un document, étape par étape :

```
1. Réception du fichier (PDF/image)
2. OCR (si scan) → texte brut
   - Tesseract / PaddleOCR selon la qualité du scan
3. Nettoyage et segmentation du texte (chunking)
   - Découpage en chunks de ~500 tokens avec chevauchement (overlap)
4. Extraction d'entités et de métadonnées (NER)
   - Date, référence, service émetteur, objet de l'acte
   - Via un modèle NLP local (spaCy fr_core_news ou LLM local en mode extraction structurée)
5. Classification automatique
   - Modèle de classification (fine-tuné ou prompt LLM) → catégorie proposée
6. Vectorisation (embeddings)
   - Modèle d'embeddings local (ex. multilingual-e5, sentence-transformers)
   - Un vecteur par chunk, stocké dans Qdrant avec métadonnées associées
7. Indexation
   - Insertion des vecteurs + métadonnées dans Qdrant
   - Insertion des métadonnées structurées dans PostgreSQL
8. Notification au backend (statut "indexé")
```

Pipeline de recherche (au moment de la requête utilisateur) :

```
1. Question en langage naturel de l'utilisateur
2. Vectorisation de la question (même modèle d'embeddings)
3. Recherche par similarité dans Qdrant (top-k chunks pertinents)
4. Filtrage optionnel par métadonnées (service, période, type d'acte)
5. Construction du prompt (contexte = chunks récupérés + question)
6. Génération de la réponse par le LLM local (Ollama - ex. Llama 3 / Mistral)
7. Retour de la réponse + citations des documents sources
```

### 5.4 Choix du LLM et des modèles

| Composant | Modèle recommandé | Raison |
|---|---|---|
| LLM de génération | Llama 3 8B ou Mistral 7B (via Ollama) | Bon compromis performance/ressources, exécutable localement, support du français correct |
| Embeddings | multilingual-e5-large ou BGE-M3 | Bonnes performances en français, open-source |
| OCR | PaddleOCR (ou Tesseract avec langue fra) | Meilleure gestion des documents administratifs scannés |
| NER / extraction | spaCy (fr_core_news_lg) ou extraction structurée via prompt LLM | Rapide pour les champs standards (dates, références) |

> Remarque méthodologique pour le mémoire : il est recommandé de comparer expérimentalement 2-3 modèles d'embeddings et 2 LLM sur un échantillon de documents réels, et de présenter les métriques (précision de récupération, temps de réponse) dans le chapitre d'évaluation.

### 5.5 Base de données — Modèle relationnel (PostgreSQL)

```
Table: utilisateurs
  id, nom, prenom, email, mot_de_passe_hash, role, service_id, date_creation

Table: services
  id, nom, description

Table: documents
  id, titre, reference, type_acte_id, service_id, date_acte,
  chemin_fichier, statut, hash_fichier, date_import, importe_par_id

Table: types_actes (taxonomie)
  id, libelle, description, parent_id (hiérarchie possible)

Table: metadonnees_extraites
  id, document_id, cle, valeur, confiance, valide_par_id

Table: chunks
  id, document_id, contenu, position, vecteur_id (référence Qdrant)

Table: journal_audit
  id, utilisateur_id, action, document_id, date_action, details

Table: sessions_recherche
  id, utilisateur_id, requete, date, resultats_json
```

### 5.6 Base vectorielle (Qdrant)

- Une **collection** par corpus (ex. `archives_prefecture`)
- Chaque point : `{id, vecteur, payload: {document_id, chunk_texte, type_acte, service, date_acte}}`
- Recherche filtrée : combinaison de la similarité cosinus + filtres sur `payload` (permet une recherche hybride sémantique + structurée)

### 5.7 Stockage des fichiers

- **MinIO** (compatible S3, déployable on-premise) pour stocker les fichiers originaux (PDF/images), séparé de la base de données relationnelle. Alternative simple : stockage sur disque avec chemin référencé en base, si le volume reste modeste.

---

## 6. Sécurité et confidentialité

| Aspect | Mesure |
|---|---|
| Authentification | JWT avec expiration courte + refresh token |
| Autorisation | RBAC (rôles : agent, archiviste, admin) + restriction par service |
| Confidentialité des données | Traitement LLM 100% local (Ollama), aucun appel à une API externe |
| Chiffrement | HTTPS obligatoire, chiffrement au repos des fichiers sensibles (LUKS/chiffrement disque) |
| Traçabilité | Journal d'audit complet (consultation, modification, export) |
| Anonymisation | Possibilité de masquer certaines données personnelles (RGPD) dans les extraits affichés selon le rôle |

---

## 7. Architecture de déploiement

```
┌─────────────────────────────────────────────────────────┐
│                    Serveur (on-premise)                  │
│                                                            │
│  ┌───────────┐  ┌───────────┐  ┌────────────────────┐   │
│  │  Nginx     │→ │  React     │  │  NestJS API         │   │
│  │  (reverse  │  │  (build    │  │  (Docker container)  │   │
│  │  proxy)    │  │  statique) │  │                        │   │
│  └───────────┘  └───────────┘  └──────────┬──────────────┘   │
│                                              │                  │
│  ┌────────────────────┐   ┌────────────────▼───────────┐    │
│  │  Service IA          │   │  PostgreSQL                 │    │
│  │  FastAPI + Ollama     │   │  Qdrant                      │    │
│  │  (Docker, GPU si dispo)│  │  MinIO                       │    │
│  └────────────────────┘   └──────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
```

- **Docker Compose** pour orchestrer l'ensemble des services en développement/petite échelle.
- **Kubernetes** envisageable en perspective si le volume de documents et le nombre d'utilisateurs justifient un passage à l'échelle.

---

## 8. Limites et perspectives (à développer dans le mémoire)

- **Limites** : dépendance à la qualité de l'OCR pour les documents anciens/manuscrits ; coût en ressources matérielles du LLM local (GPU recommandé pour des temps de réponse acceptables) ; nécessité d'un corpus d'entraînement/évaluation représentatif pour mesurer la pertinence de la classification automatique.
- **Perspectives** : apprentissage actif (l'archiviste corrige → le modèle de classification s'améliore) ; recherche multimodale (interrogation à partir d'images de documents) ; intégration d'une signature électronique pour les actes validés.

---

## 9. Synthèse de la stack technologique

| Couche | Technologies |
|---|---|
| Frontend | React, TypeScript, Tailwind CSS, shadcn/ui, TanStack Query |
| Backend applicatif | Node.js, NestJS, TypeScript, Prisma |
| Service IA / RAG | Python, FastAPI, LangChain/LlamaIndex, Ollama (Llama 3 / Mistral), spaCy, PaddleOCR |
| Bases de données | PostgreSQL (métadonnées), Qdrant (vecteurs) |
| Stockage fichiers | MinIO (ou disque local) |
| Déploiement | Docker, Docker Compose (Kubernetes en perspective) |
| Sécurité | JWT, RBAC, HTTPS, chiffrement au repos |

---

*Ce document constitue une base de conception qui peut être approfondie section par section (diagrammes UML formels, maquettes d'interface, spécification API détaillée, protocole d'évaluation des modèles) selon les exigences du mémoire.*