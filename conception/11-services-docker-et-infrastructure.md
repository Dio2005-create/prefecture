# Services Docker et infrastructure — e-Servisy d'Ihosy

## 1. Objet

Ce document décrit les conteneurs déclarés dans `docker-compose.yml`, leur fonction et leurs relations. Il distingue les services d'infrastructure, les applications e-Servisy et les composants simplement référencés par configuration.

## 2. Services déclarés dans Docker Compose

| Service Compose | Image / construction | Fonction | Port publié | Persistance et état |
|---|---|---|---|---|
| `postgres` | `pgvector/pgvector:pg16` | Base PostgreSQL des données métier ; l'image inclut pgvector. Le backend s'y connecte avec Prisma. | `5432` | Volume `postgres_data`. |
| `qdrant` | `qdrant/qdrant:v1.12.5` | Base vectorielle pour l'indexation et la recherche sémantique déclenchées par les traitements documentaires autorisés. | `6333` | Volume `qdrant_data`. |
| `minio` | `minio/minio` | Stockage objet compatible S3 et console d'administration. Le conteneur est démarré et ses données sont persistées. | `9000` API, `9001` console | Volume `minio_data`. Le backend actuel n'est pas configuré pour y déposer ses pièces : elles sont stockées dans son volume d'uploads. |
| `ai-service` | Image construite depuis `services/ai-service` | API FastAPI pour OCR, embeddings, génération et classification ; elle appelle Ollama pour les modèles et Qdrant selon ses routes. | `8000` | Pas de volume métier déclaré dans Compose. Dépend de `qdrant`. |
| `backend` | Image construite avec `apps/backend/Dockerfile` | API NestJS : règles métier, authentification, droits, accès PostgreSQL, traitements de documents et génération de PDF. | `3000` | Volume `uploads_data` pour les fichiers et montage en lecture seule des modèles PDF. Dépend de `ai-service` et `postgres`. |
| `frontend` | Image construite depuis `apps/frontend` | Interface web React servie en développement par le conteneur frontend. | `5173` | Le code source est monté depuis `apps/frontend`; `frontend_node_modules` conserve les dépendances du conteneur. Dépend du `backend`. |

## 3. Ollama : dépendance externe, pas conteneur Compose actuel

Ollama n'est pas déclaré sous `services:` dans le `docker-compose.yml` actuel. Les conteneurs `ai-service` et `backend` sont configurés pour le joindre via `http://host.docker.internal:11434`, ce qui signifie que le serveur Ollama doit être démarré et accessible depuis l'hôte Docker.

Les valeurs `mistral` et `nomic-embed-text` désignent les modèles configurés pour la génération et les embeddings. Il faut télécharger ces modèles dans Ollama et vérifier leur disponibilité avant d'utiliser les fonctions IA dépendantes.

Un fichier `OllamaService` existe côté NestJS, mais le module IA actif utilise `FastApiAiService`. Dans le flux Compose décrit ici, c'est donc `ai-service` qui communique avec Ollama ; Ollama lui-même reste un service externe au réseau de conteneurs.

## 4. Relations et flux entre les services

```text
Navigateur
    |
    v
frontend :5173
    |
    v
backend :3000 ------> postgres :5432
    |
    v
ai-service :8000 ---> qdrant :6333
    |
    v
Ollama sur l'hôte :11434

minio :9000 / console :9001
    (démarré, mais non relié au stockage métier du backend actuellement)
```

- Compose fournit les noms DNS internes des services (`postgres`, `qdrant`, `ai-service`) aux autres conteneurs.
- `depends_on` ordonne le démarrage, mais ne garantit pas à lui seul que le service dépendant est déjà prêt à accepter des requêtes.
- Le backend passe par `ai-service` pour les tâches IA configurées ; il utilise PostgreSQL pour les données métier.
- Le flux d'import/indexation documentaire peut envoyer des vecteurs à Qdrant via le backend ou le service IA, selon la route de traitement.
- MinIO est un composant déployé mais, avant de l'utiliser pour les fichiers citoyens, il faut intégrer son client au backend, configurer buckets et droits, puis migrer ou gérer les fichiers déjà stockés dans `uploads_data`.

## 5. Volumes Docker

- `postgres_data` : données persistantes de PostgreSQL.
- `qdrant_data` : collection et données de Qdrant.
- `minio_data` : objets déposés dans MinIO, même si le stockage métier actuel ne l'utilise pas.
- `uploads_data` : fichiers déposés et lus par le backend actuel.
- `frontend_node_modules` : dépendances installées du frontend dans son conteneur.

La suppression d'un conteneur ne supprime normalement pas son volume nommé. La sauvegarde, la restauration et la rétention de chaque volume doivent néanmoins être configurées et testées pour les environnements exploités.

## 6. Configuration et sécurité de déploiement

- Les identifiants présents dans le Compose de développement ne doivent pas être réutilisés en production. Fournir des secrets distincts via un gestionnaire de secrets ou des variables d'environnement protégées.
- N'exposer à Internet que les ports nécessaires ; en particulier, limiter l'accès aux consoles de base de données, Qdrant et MinIO au réseau d'administration.
- Configurer des contrôles de santé et des politiques de redémarrage dans la cible de déploiement ; `depends_on` seul ne constitue pas un contrôle de disponibilité.
- Définir la configuration TLS, les sauvegardes, la surveillance d'espace disque et la rotation des journaux.
- Si Ollama est conteneurisé dans une évolution future, l'ajouter explicitement à Compose avec les ressources GPU/CPU, volumes de modèles, contrôles de santé et URL interne appropriés ; ce changement n'est pas fait dans la configuration actuelle.

## 7. Vérification de cohérence

Ce descriptif reflète les services et volumes déclarés dans `docker-compose.yml`. Tout changement de cette configuration doit conduire à mettre à jour ce document et les valeurs d'environnement documentées.
