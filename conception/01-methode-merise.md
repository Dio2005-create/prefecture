# 1. Présentation de la méthode Merise

Merise sépare les données et les traitements afin de décrire une application de manière progressive.

## Niveaux utilisés

- **Conceptuel** : besoins métier indépendants de la technique. Le MCD décrit les objets et leurs relations; le MCT décrit les événements et opérations.
- **Logique** : traduction du modèle conceptuel en tables, clés et cardinalités. Le MLD prépare l'implémentation relationnelle.
- **Organisationnel** : acteurs, canaux, horaires, responsabilités et règles d'exécution. Le MOT décrit qui fait quoi et à quel moment.
- **Physique** : implémentation PostgreSQL avec Prisma, API NestJS, interface React et services IA.

## Périmètre

La plateforme gère les citoyens, administrateurs et superadministrateurs, les demandes administratives, les pièces jointes, les paiements statiques, les rendez-vous, notifications, documents officiels, modèles, cachets, signatures et assistance IA.
