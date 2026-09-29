import { PrismaClient, RequestType, RoleName, RoleUtilisateur, UserStatus } from '@prisma/client';
import { createHash } from 'node:crypto';

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
  const templates: Array<{ requestType: RequestType; name: string; bodyText: string }> = [
    ['BIRTH_CERTIFICATE', 'Modèle par défaut - Acte de naissance', 'Le présent acte ou extrait est délivré après vérification du dossier par la Préfecture.'],
    ['RESIDENCE_CERTIFICATE', 'Modèle par défaut - Certificat de résidence', 'Le présent certificat atteste la résidence déclarée après instruction du dossier.'],
    ['NATIONALITY_CERTIFICATE', 'Modèle par défaut - Certificat de nationalité', 'Le présent certificat est délivré après vérification des pièces relatives à la nationalité.'],
    ['CIN_REQUEST', 'Modèle par défaut - Demande de CIN', 'Dossier de première demande de carte d’identité nationale enregistré par la Préfecture.'],
    ['CIN_RENEWAL', 'Modèle par défaut - Renouvellement de CIN', 'Dossier de renouvellement de carte d’identité nationale enregistré par la Préfecture.'],
    ['GOOD_CHARACTER_CERTIFICATE', 'Modèle par défaut - Bonne vie et mœurs', 'Le présent certificat est délivré après vérification administrative du dossier.'],
    ['BUILDING_PERMIT', 'Modèle par défaut - Permis de construire', 'La présente autorisation est délivrée sous réserve du respect des règles applicables aux constructions.'],
    ['LAND_STATUS', 'Modèle par défaut - Situation foncière', 'La présente attestation reprend les informations foncières vérifiées dans le dossier.'],
    ['COMMERCIAL_LICENSE', 'Modèle par défaut - Licence commerciale', 'La présente autorisation commerciale est délivrée après instruction du dossier.'],
    ['VEHICLE_REGISTRATION', 'Modèle par défaut - Immatriculation de véhicule', 'La présente attestation confirme l’enregistrement administratif du véhicule.'],
    ['LOSS_DECLARATION', 'Modèle par défaut - Déclaration de perte', 'La présente déclaration de perte est enregistrée par la Préfecture.'],
    ['SIGNATURE_LEGALIZATION', 'Modèle par défaut - Légalisation de signature', 'La signature est légalisée après vérification de l’identité du signataire.'],
    ['COMPLAINT', 'Modèle par défaut - Signalement ou réclamation', 'Le présent récépissé confirme l’enregistrement du signalement ou de la réclamation.'],
    ['SPECIAL_REQUEST', 'Modèle par défaut - Demande particulière', 'La présente demande particulière a été enregistrée pour instruction administrative.'],
    ['ASSOCIATION_DECLARATION', 'Modèle par défaut - Déclaration d’association ou ONG', 'Le présent récépissé confirme le dépôt du dossier de déclaration de l’association ou ONG.'],
    ['EVENT_AUTHORIZATION', 'Modèle par défaut - Autorisation de manifestation', 'La présente autorisation est délivrée sous réserve du respect des conditions administratives et de sécurité.'],
    ['ACCREDITATION', 'Modèle par défaut - Agrément', 'La présente décision d’agrément est délivrée après instruction du dossier.'],
    ['ADMINISTRATIVE_AUTHORIZATION', 'Modèle par défaut - Autorisation administrative', 'La présente autorisation administrative est délivrée après examen des justificatifs fournis.'],
  ].map(([requestType, name, bodyText]) => ({ requestType: requestType as RequestType, name, bodyText }));

  for (const template of templates) {
    await prisma.documentTemplate.createMany({
      data: template,
      skipDuplicates: true,
    });
  }

  console.log(`✓ ${templates.length} modèles par défaut vérifiés`);
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
