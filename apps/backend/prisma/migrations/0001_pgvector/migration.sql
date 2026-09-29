CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector";

CREATE TYPE "TypeDocument" AS ENUM ('ACTE', 'ARRETE', 'COURRIER', 'AUTRE');
CREATE TYPE "StatutDocument" AS ENUM ('BROUILLON', 'EN_TRAITEMENT', 'VALIDE', 'ARCHIVE', 'ERREUR');
CREATE TYPE "RoleUtilisateur" AS ENUM ('USER', 'ADMIN');
CREATE TYPE "MethodeClassification" AS ENUM ('AUTOMATIQUE', 'IA', 'MANUELLE');

CREATE TABLE "User" ("id" TEXT NOT NULL DEFAULT gen_random_uuid(), "email" TEXT NOT NULL, "nom" TEXT, "passwordHash" TEXT, "role" "RoleUtilisateur" NOT NULL DEFAULT 'USER', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "User_pkey" PRIMARY KEY ("id"));
CREATE TABLE "Categorie" ("id" TEXT NOT NULL DEFAULT gen_random_uuid(), "libelle" TEXT NOT NULL, "description" TEXT, "motsCles" TEXT[] NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "Categorie_pkey" PRIMARY KEY ("id"));
CREATE TABLE "DocumentAdministratif" ("id" TEXT NOT NULL DEFAULT gen_random_uuid(), "titre" TEXT NOT NULL, "reference" TEXT, "contenuTexte" TEXT, "type" "TypeDocument" NOT NULL, "date" TIMESTAMP(3), "serviceEmetteur" TEXT, "auteurEmetteur" TEXT, "metadonnees" JSONB NOT NULL DEFAULT '{}', "cheminFichier" TEXT NOT NULL, "nomFichierOriginal" TEXT, "mimeType" TEXT, "tailleFichier" INTEGER, "statut" "StatutDocument" NOT NULL DEFAULT 'BROUILLON', "etapeTraitement" TEXT, "erreurTraitement" TEXT, "scoreClassification" DOUBLE PRECISION, "methodeClassification" "MethodeClassification", "categorieId" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "DocumentAdministratif_pkey" PRIMARY KEY ("id"));
CREATE TABLE "Chunk" ("id" TEXT NOT NULL DEFAULT gen_random_uuid(), "documentId" TEXT NOT NULL, "contenu" TEXT NOT NULL, "position" INTEGER NOT NULL, "metadonnees" JSONB NOT NULL DEFAULT '{}', "page" INTEGER, "embeddingModel" TEXT, "embeddingDimension" INTEGER, "embedding" vector(768), CONSTRAINT "Chunk_pkey" PRIMARY KEY ("id"));
CREATE TABLE "RequeteUtilisateur" ("id" TEXT NOT NULL DEFAULT gen_random_uuid(), "texte" TEXT NOT NULL, "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "utilisateurId" TEXT, "reponseGeneree" TEXT, CONSTRAINT "RequeteUtilisateur_pkey" PRIMARY KEY ("id"));
CREATE TABLE "RequeteSource" ("id" TEXT NOT NULL DEFAULT gen_random_uuid(), "requeteId" TEXT NOT NULL, "chunkId" TEXT NOT NULL, "score" DOUBLE PRECISION, CONSTRAINT "RequeteSource_pkey" PRIMARY KEY ("id"));
CREATE TABLE "JournalAudit" ("id" TEXT NOT NULL DEFAULT gen_random_uuid(), "utilisateurId" TEXT, "documentId" TEXT, "action" TEXT NOT NULL, "details" JSONB NOT NULL DEFAULT '{}', "dateAction" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "JournalAudit_pkey" PRIMARY KEY ("id"));

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "Categorie_libelle_key" ON "Categorie"("libelle");
CREATE INDEX "DocumentAdministratif_type_idx" ON "DocumentAdministratif"("type");
CREATE INDEX "DocumentAdministratif_date_idx" ON "DocumentAdministratif"("date");
CREATE INDEX "DocumentAdministratif_categorieId_idx" ON "DocumentAdministratif"("categorieId");
CREATE INDEX "DocumentAdministratif_statut_idx" ON "DocumentAdministratif"("statut");
CREATE INDEX "DocumentAdministratif_reference_idx" ON "DocumentAdministratif"("reference");
CREATE INDEX "DocumentAdministratif_serviceEmetteur_idx" ON "DocumentAdministratif"("serviceEmetteur");
CREATE UNIQUE INDEX "Chunk_documentId_position_key" ON "Chunk"("documentId", "position");
CREATE INDEX "Chunk_documentId_idx" ON "Chunk"("documentId");
CREATE INDEX "RequeteUtilisateur_date_idx" ON "RequeteUtilisateur"("date");
CREATE INDEX "RequeteUtilisateur_utilisateurId_idx" ON "RequeteUtilisateur"("utilisateurId");
CREATE UNIQUE INDEX "RequeteSource_requeteId_chunkId_key" ON "RequeteSource"("requeteId", "chunkId");
CREATE INDEX "JournalAudit_dateAction_idx" ON "JournalAudit"("dateAction");
CREATE INDEX "JournalAudit_utilisateurId_idx" ON "JournalAudit"("utilisateurId");
CREATE INDEX "JournalAudit_documentId_idx" ON "JournalAudit"("documentId");
CREATE INDEX "Chunk_embedding_hnsw_idx" ON "Chunk" USING hnsw ("embedding" vector_cosine_ops);

ALTER TABLE "DocumentAdministratif" ADD CONSTRAINT "DocumentAdministratif_categorieId_fkey" FOREIGN KEY ("categorieId") REFERENCES "Categorie"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Chunk" ADD CONSTRAINT "Chunk_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "DocumentAdministratif"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RequeteUtilisateur" ADD CONSTRAINT "RequeteUtilisateur_utilisateurId_fkey" FOREIGN KEY ("utilisateurId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RequeteSource" ADD CONSTRAINT "RequeteSource_requeteId_fkey" FOREIGN KEY ("requeteId") REFERENCES "RequeteUtilisateur"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RequeteSource" ADD CONSTRAINT "RequeteSource_chunkId_fkey" FOREIGN KEY ("chunkId") REFERENCES "Chunk"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "JournalAudit" ADD CONSTRAINT "JournalAudit_utilisateurId_fkey" FOREIGN KEY ("utilisateurId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "JournalAudit" ADD CONSTRAINT "JournalAudit_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "DocumentAdministratif"("id") ON DELETE SET NULL ON UPDATE CASCADE;
