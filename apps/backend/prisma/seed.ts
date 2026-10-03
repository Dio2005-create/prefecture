import { PrismaClient, RequestType, RoleName, RoleUtilisateur, UserStatus } from '@prisma/client';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { requestModels } from '../src/requests/request-models';

const prisma = new PrismaClient();

const hashPassword = (password: string) => createHash('sha256').update(password).digest('hex');

async function seedServices() {
  const services = [
    {
      code: 'BC',
      nameFr: 'Acte de naissance',
      nameMg: 'Dokimarahana fiziana',
      description: 'Demande d\'extrait ou de copie d\'acte de naissance',
    },
    {
      code: 'CR',
      nameFr: 'Certificat de résidence',
      nameMg: 'Tanarana',
      description: 'Certificat attestant la résidence d\'une personne',
    },
    {
      code: 'CIN',
      nameFr: 'Carte d\'identité nationale',
      nameMg: 'Karatan\'ny isa',
      description: 'Demande de CIN neuve ou renouvellement',
    },
    {
      code: 'AP',
      nameFr: 'Permis de construire',
      nameMg: 'Aomanana handrosoina',
      description: 'Autorisation de construire un bâtiment',
    },
    {
      code: 'LS',
      nameFr: 'Situation du terrain',
      nameMg: 'Toetran\'ny tany',
      description: 'Vérification de la situation et de la propriété du terrain',
    },
    {
      code: 'BCC',
      nameFr: 'Certificat de bonne conduite',
      nameMg: 'Toetran\'ny fihetsika',
      description: 'Attestation de bonne moralité et conduite',
    },
    {
      code: 'VR',
      nameFr: 'Immatriculation de véhicule',
      nameMg: 'Fisoratana karôtera',
      description: 'Enregistrement ou renouvellement d\'immatriculation',
    },
    {
      code: 'DL',
      nameFr: 'Déclaration de perte',
      nameMg: 'Filasafidim-pihitrizahana',
      description: 'Déclaration officielle de perte de documents',
    },
    {
      code: 'ASSOC',
      nameFr: 'Création ou déclaration d’association / ONG',
      nameMg: 'Fananganana fikambanana na ONG',
      description: 'Dépôt d’un dossier de création ou de déclaration d’une association ou ONG',
    },
    {
      code: 'MANIF',
      nameFr: 'Autorisation de manifestation, foire ou quête',
      nameMg: 'Fahazoan-dalana hanao hetsika, tsena na fangataham-bola',
      description: 'Demande d’autorisation pour une manifestation, une foire ou une quête',
    },
    {
      code: 'AGREMENT',
      nameFr: 'Demande d’agrément',
      nameMg: 'Fangatahana fankatoavana',
      description: 'Demande d’agrément administratif auprès de la préfecture',
    },
    {
      code: 'AUTRE',
      nameFr: 'Autre autorisation administrative',
      nameMg: 'Fahazoan-dalana ara-panjakana hafa',
      description: 'Autres autorisations relevant des compétences de la préfecture',
    },
    {
      code: 'RECLAMATION',
      nameFr: 'Signalement ou réclamation',
      nameMg: 'Fampandrenesana na fitarainana',
      description: 'Signalement d’une situation ou réclamation administrative',
    },
  ];

  for (const service of services) {
    await prisma.prefectureService.upsert({
      where: { code: service.code },
      update: service,
      create: { ...service, isActive: true },
    });
  }

  console.log(`✓ ${services.length} services seeded`);
}

async function seedRoles() {
  const roles: Array<{ name: RoleName; description: string }> = [
    { name: 'CITIZEN', description: 'Citoyen - Accès Front-Office' },
    { name: 'ADMIN', description: 'Administrateur système' },
  ];

  await prisma.userRole.deleteMany({ where: { role: { name: { notIn: [RoleName.CITIZEN, RoleName.ADMIN] } } } });
  await prisma.role.deleteMany({ where: { name: { notIn: [RoleName.CITIZEN, RoleName.ADMIN] } } });

  for (const role of roles) {
    await prisma.role.upsert({
      where: { name: role.name },
      update: { description: role.description },
      create: role,
    });
  }

  console.log(`✓ ${roles.length} roles seeded`);
}

async function seedUsers() {
  const users = [
    {
      email: 'admin@prefecture.mg',
      nom: 'Administrateur système',
      phone: '0320000001',
      cin: 'ADMIN0001',
      password: 'Admin123!',
      role: RoleUtilisateur.ADMIN,
      status: 'ACTIVE' as UserStatus,
      roles: ['ADMIN'] as RoleName[],
    },
    {
      email: 'citoyen@prefecture.mg',
      nom: 'Citoyen test',
      phone: '0320000002',
      cin: 'CITOY0001',
      password: 'Citoyen123!',
      role: RoleUtilisateur.CITIZEN,
      status: 'ACTIVE' as UserStatus,
      roles: ['CITIZEN'] as RoleName[],
    },
  ];

  for (const user of users) {
    await prisma.user.upsert({
      where: { email: user.email },
      update: {
        nom: user.nom,
        phone: user.phone,
        cin: user.cin,
        passwordHash: hashPassword(user.password),
        role: user.role,
        status: user.status,
        roles: {
          deleteMany: {},
          create: user.roles.map((roleName) => ({
            role: {
              connect: { name: roleName },
            },
          })),
        },
      },
      create: {
        email: user.email,
        nom: user.nom,
        phone: user.phone,
        cin: user.cin,
        passwordHash: hashPassword(user.password),
        role: user.role,
        status: user.status,
        locale: 'fr',
        roles: {
          create: user.roles.map((roleName) => ({
            role: {
              connect: { name: roleName },
            },
          })),
        },
      },
    });
  }

  console.log(`✓ ${users.length} users seeded`);
}

async function seedDocumentTemplates() {
  const modelDirectory = process.env.REQUEST_MODELS_DIR ?? join(process.cwd(), '../../modeles_pdf');
  const templates = Object.entries(requestModels).map(([requestType, model]) => ({
    requestType: requestType as RequestType,
    name: model.title,
    storagePath: join(modelDirectory, model.pdfFile),
    originalName: model.pdfFile,
    mimeType: 'application/pdf',
    isActive: true,
  }));

  await prisma.documentTemplate.deleteMany();
  await prisma.documentTemplate.createMany({ data: templates });
  console.log(`✓ ${templates.length} modèles PDF fournis activés`);
}

async function main() {
  try {
    console.log('🌱 Seeding database...');
    await seedRoles();
    await seedServices();
    await seedUsers();
    await seedDocumentTemplates();
    console.log('✅ Seeding completed');
  } catch (e) {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
