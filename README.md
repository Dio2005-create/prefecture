# Archives administratives intelligentes

Socle du système décrit dans `conception.md` :

- `apps/backend` : API métier NestJS
- `services/ai-service` : service IA/RAG FastAPI
- `apps/frontend` : interface React/TypeScript
- PostgreSQL, Qdrant et MinIO : services d'infrastructure
- PostgreSQL avec pgvector : recherche vectorielle SQL et métadonnées relationnelles

## Démarrage

```bash
docker compose up --build
docker compose exec backend npx prisma migrate deploy
```

La commande `prisma migrate deploy` applique les migrations PostgreSQL à partir de [schema.prisma](apps/backend/prisma/schema.prisma). Elle conserve les volumes existants.

Pour arrêter la stack sans supprimer les données :

```powershell
docker compose down
```

Ne pas ajouter `-v` sauf si tu veux supprimer les volumes PostgreSQL, Qdrant, MinIO et uploads.

Endpoints de vérification :

- Frontend : http://localhost:5173
- Backend : http://localhost:3000/health
- Service IA : http://localhost:8000/health
- Qdrant : http://localhost:6333/healthz
- MinIO console : http://localhost:9001

Le stockage métier, le premier flux d’indexation et l’authentification RBAC sont disponibles. L’OCR et la classification automatique restent les prochaines étapes.

Ollama doit être installé localement et exposer les modèles configurés avant d'appeler l'indexation ou le RAG.

## Tester le frontend

Depuis la racine du projet :

```powershell
npm --prefix apps/frontend install
npm --prefix apps/frontend run build
npm --prefix apps/frontend run dev
```

Ouvrir ensuite http://localhost:5173. L'API NestJS est utilisée sur `http://localhost:3000` par défaut. Pour changer cette adresse, définir `VITE_API_URL` avant le lancement.

## API documentaire

- `POST /documents` : créer un document avec son texte
- `POST /documents/upload` : déposer un fichier multipart (`file`, `type`, `titre` facultatif)
- `POST /documents/:id/index` : découper, vectoriser avec Ollama et indexer dans Qdrant
- `GET /documents` et `GET /documents/:id` : consulter les documents et leurs chunks
- `DELETE /documents/:id` : supprimer le document et ses vecteurs
- `POST /rag/search` : recherche sémantique brute
- `POST /rag/ask` : réponse RAG avec sources

Variables IA : `OLLAMA_URL`, `OLLAMA_EMBEDDING_MODEL`, `OLLAMA_CHAT_MODEL`, `QDRANT_URL`, `QDRANT_COLLECTION`, `OLLAMA_BASE_URL`, `OLLAMA_MODEL`, `EMBEDDING_MODEL`.

Le service FastAPI expose aussi `POST /ocr`, `POST /extract-text`, `POST /classify`, `POST /embeddings` et `POST /generate`. Les fichiers PDF/images nécessitent encore l'installation d'un moteur OCR local (PaddleOCR ou Tesseract).

Pour la migration pgvector : `docker compose exec backend npx prisma migrate deploy`.

## Module Contrôle des armements

Le module permet aux citoyens de soumettre des demandes de permis de détention ou de port, d’enregistrement, de renouvellement, de radiation et de transfert. Les armes ne sont ajoutées au registre qu’après validation administrative. Les citoyens ne peuvent consulter que leurs propres armes, permis, demandes et pièces justificatives; la recherche par numéro de série, les dossiers citoyens, l’historique complet et les rapports sont réservés aux administrateurs.

Les routes principales sont `GET /firearms`, `GET /firearms/permits`, `GET /firearms/requests` et `POST /firearms/requests` (multipart avec les justificatifs). L’administration utilise `GET /firearms/admin/requests`, `PATCH /firearms/admin/requests/:id/decision`, `GET /firearms/admin/search?serial=...`, `GET /firearms/admin/citizens/:id`, `GET /firearms/admin/stats` et `GET /firearms/admin/report.csv`. Un document officiel est téléchargeable depuis `GET /firearms/requests/:id/document` après approbation.

À déployer avec les autres migrations Prisma :

```powershell
docker compose exec backend npx prisma migrate deploy
```

La date d’échéance n’est pas présumée par l’application : l’agent la fixe lors de la validation d’un permis. Les notifications d’échéance sont émises dans les 30 jours précédant l’expiration.
