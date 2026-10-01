import { RequestType } from '@prisma/client';

export interface RequestModel {
  title: string;
  titleMg: string;
  pdfFile: string;
  aliases: string[];
}

export const requestModels: Record<RequestType, RequestModel> = {
  BIRTH_CERTIFICATE: { title: 'Acte de naissance', titleMg: 'Kopia nahaterahana', pdfFile: '02_Demande_Acte_de_Naissance.pdf', aliases: ['acte de naissance', 'copie acte de naissance', 'fangatahana kopia nahaterahana', 'taratasy nahaterahana'] },
  RESIDENCE_CERTIFICATE: { title: 'Certificat de résidence', titleMg: 'Taratasy fanamarinam-ponenana', pdfFile: '01_Certificat_de_Residence.pdf', aliases: ['certificat de residence', 'fanamarinam-ponenana', 'fanamarinana fonenana', 'taratasy fonenana'] },
  NATIONALITY_CERTIFICATE: { title: 'Certificat de nationalité', titleMg: 'Taratasy fanamarinam-pirenena', pdfFile: '03_Demande_Certificat_de_Nationalite.pdf', aliases: ['certificat de nationalite', 'fanamarinam-pirenena', 'zom-pirenena', 'nationalite malagasy'] },
  CIN_REQUEST: { title: 'Demande de CIN', titleMg: 'Fangatahana kara-panondro', pdfFile: '04_Demande_CIN.pdf', aliases: ['demande de cin', 'carte identite nationale', 'karapanondro', 'kara-panondro'] },
  CIN_RENEWAL: { title: 'Renouvellement de CIN', titleMg: 'Fanavaozana kara-panondro', pdfFile: '05_Renouvellement_CIN.pdf', aliases: ['renouvellement de cin', 'renouveler cin', 'fanavaozana cin', 'fanavaozana karapanondro'] },
  GOOD_CHARACTER_CERTIFICATE: { title: 'Certificat de bonne conduite et de bonnes mœurs', titleMg: 'Taratasy fanamarinana fitondran-tena', pdfFile: '06_Certificat_Bonne_Vie_et_Moeurs.pdf', aliases: ['bonne vie et moeurs', 'bonne conduite', 'fitondran-tena', 'fitondran-tena tsara'] },
  BUILDING_PERMIT: { title: 'Permis de construire', titleMg: 'Fahazoan-dalana hanorina', pdfFile: '07_Demande_Permis_de_Construire.pdf', aliases: ['permis de construire', 'autorisation de construire', 'fahazoan-dalana hanorina', 'hanorina trano'] },
  LAND_STATUS: { title: 'Certificat de situation foncière', titleMg: 'Taratasy momba ny satan’ny tany', pdfFile: '08_Demande_Situation_Fonciere.pdf', aliases: ['situation fonciere', 'certificat foncier', 'satan ny tany', 'momba ny tany'] },
  COMMERCIAL_LICENSE: { title: 'Licence commerciale / patente', titleMg: 'Fahazoan-dalana ara-barotra', pdfFile: '09_Demande_Licence_Commerciale.pdf', aliases: ['licence commerciale', 'licence de commerce', 'patente', 'fahazoan-dalana ara-barotra'] },
  VEHICLE_REGISTRATION: { title: 'Immatriculation de véhicule', titleMg: 'Fisoratana anarana fiara', pdfFile: '10_Demande_Immatriculation_Vehicule.pdf', aliases: ['immatriculation vehicule', 'immatriculation de vehicule', 'fisoratana fiara', 'fisoratana anarana fiara'] },
  LOSS_DECLARATION: { title: 'Déclaration de perte', titleMg: 'Fanambarana fahaverezana', pdfFile: '11_Declaration_de_Perte.pdf', aliases: ['declaration de perte', 'declarer une perte', 'document perdu', 'fanambarana fahaverezana', 'fanambarana very', 'very ny'] },
  SIGNATURE_LEGALIZATION: { title: 'Légalisation de signature', titleMg: 'Fanamarinana sonia', pdfFile: '12_Demande_Legalisation_Signature.pdf', aliases: ['legalisation de signature', 'legaliser une signature', 'fanamarinana sonia'] },
  COMPLAINT: { title: 'Signalement / réclamation', titleMg: 'Fitarainana', pdfFile: '13_Signalement_Reclamation.pdf', aliases: ['signalement', 'reclamation', 'fitarainana', 'fitoriana'] },
  SPECIAL_REQUEST: { title: 'Demande particulière', titleMg: 'Fangatahana manokana', pdfFile: '14_Demande_Particuliere.pdf', aliases: ['demande particuliere', 'fangatahana manokana'] },
  ASSOCIATION_DECLARATION: { title: 'Déclaration d’association / ONG', titleMg: 'Fanambarana fikambanana', pdfFile: '15_Declaration_Association_ONG.pdf', aliases: ['declaration association', 'association ong', 'fanambarana fikambanana'] },
  EVENT_AUTHORIZATION: { title: 'Autorisation de manifestation / foire / quête', titleMg: 'Fahazoan-dalana hanao hetsika', pdfFile: '16_Autorisation_Manifestation.pdf', aliases: ['autorisation manifestation', 'manifestation', 'foire', 'quete', 'fahazoan-dalana hanao hetsika'] },
  ACCREDITATION: { title: 'Demande d’agrément', titleMg: 'Fangatahana fankatoavana', pdfFile: '17_Demande_Agrement.pdf', aliases: ['demande agrement', 'agrement', 'fankatoavana'] },
  ADMINISTRATIVE_AUTHORIZATION: { title: 'Autorisation administrative', titleMg: 'Fahazoan-dalana ara-panjakana', pdfFile: '18_Autre_Autorisation_Administrative.pdf', aliases: ['autorisation administrative', 'autre autorisation', 'fahazoan-dalana ara-panjakana'] },
};

export function findRequestModel(question: string): RequestType | undefined {
  const normalizedQuestion = normalize(question);
  const matches = Object.entries(requestModels)
    .flatMap(([type, model]) => model.aliases.map((alias) => ({ type: type as RequestType, alias: normalize(alias) })))
    .filter(({ alias }) => normalizedQuestion.includes(alias))
    .sort((left, right) => right.alias.length - left.alias.length);
  return matches[0]?.type;
}

function normalize(value: string) {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}