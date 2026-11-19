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
  LOSS_DECLARATION: { title: 'Déclaration de perte', titleMg: 'Fanambarana fahaverezana', pdfFile: '11_Declaration_de_Perte.pdf', aliases: ['declaration de perte', 'declarer une perte', 'materiel perdu', 'document perdu', 'fanambarana fahaverezana', 'fanambarana very', 'very ny'] },
  SIGNATURE_LEGALIZATION: { title: 'Légalisation de signature', titleMg: 'Fanamarinana sonia', pdfFile: '12_Demande_Legalisation_Signature.pdf', aliases: ['legalisation de signature', 'legaliser une signature', 'fanamarinana sonia'] },
  COMPLAINT: { title: 'Réclamation citoyenne', titleMg: 'Fitarainana', pdfFile: '13_Signalement_Reclamation.pdf', aliases: ['signalement', 'reclamation', 'fitarainana', 'fitoriana'] },
  SPECIAL_REQUEST: { title: 'Demande particulière', titleMg: 'Fangatahana manokana', pdfFile: '14_Demande_Particuliere.pdf', aliases: ['demande particuliere', 'fangatahana manokana'] },
  ASSOCIATION_DECLARATION: { title: 'Déclaration d’association / ONG', titleMg: 'Fanambarana fikambanana', pdfFile: '15_Declaration_Association_ONG.pdf', aliases: ['declaration association', 'association ong', 'fanambarana fikambanana'] },
  EVENT_AUTHORIZATION: { title: 'Autorisation de manifestation / foire / quête', titleMg: 'Fahazoan-dalana hanao hetsika', pdfFile: '16_Autorisation_Manifestation.pdf', aliases: ['autorisation manifestation', 'manifestation', 'foire', 'quete', 'fahazoan-dalana hanao hetsika'] },
  ACCREDITATION: { title: 'Demande d’agrément', titleMg: 'Fangatahana fankatoavana', pdfFile: '17_Demande_Agrement.pdf', aliases: ['demande agrement', 'agrement', 'fankatoavana'] },
  ADMINISTRATIVE_AUTHORIZATION: { title: 'Autorisation administrative', titleMg: 'Fahazoan-dalana ara-panjakana', pdfFile: '18_Autre_Autorisation_Administrative.pdf', aliases: ['autorisation administrative', 'autre autorisation', 'fahazoan-dalana ara-panjakana'] },
};

export function findRequestModel(question: string): RequestType | undefined {
  const normalizedQuestion = normalize(question);
  const exactMatches = Object.entries(requestModels)
    .flatMap(([type, model]) => model.aliases.map((alias) => ({ type: type as RequestType, alias: normalize(alias) })))
    .filter(({ alias }) => normalizedQuestion.includes(alias))
    .sort((left, right) => right.alias.length - left.alias.length);
  if (exactMatches.length) return exactMatches[0].type;

  const questionWords = normalizedQuestion.match(/[a-z0-9]+/g) ?? [];
  const fuzzyMatches = Object.entries(requestModels)
    .flatMap(([type, model]) => model.aliases.map((alias) => ({
      type: type as RequestType,
      words: normalize(alias).match(/[a-z0-9]+/g) ?? [],
    })))
    .flatMap(({ type, words }) => {
      if (!words.length || words.length > questionWords.length) return [];
      for (let start = 0; start <= questionWords.length - words.length; start += 1) {
        let distance = 0;
        for (let index = 0; index < words.length; index += 1) {
          const expected = words[index];
          const actual = questionWords[start + index];
          if (expected === actual) continue;
          if (expected.length < 4 || actual.length < 4) {
            distance = 2;
            break;
          }
          distance += editDistanceAtMostOne(expected, actual);
          if (distance > 1) break;
        }
        if (distance === 1) return [{ type }];
      }
      return [];
    });

  const matchingTypes = [...new Set(fuzzyMatches.map(({ type }) => type))];
  return matchingTypes.length === 1 ? matchingTypes[0] : undefined;
}

function normalize(value: string) {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

function editDistanceAtMostOne(left: string, right: string) {
  if (Math.abs(left.length - right.length) > 1) return 2;

  let leftIndex = 0;
  let rightIndex = 0;
  let differences = 0;
  while (leftIndex < left.length && rightIndex < right.length) {
    if (left[leftIndex] === right[rightIndex]) {
      leftIndex += 1;
      rightIndex += 1;
      continue;
    }

    differences += 1;
    if (differences > 1) return 2;
    if (left.length > right.length) leftIndex += 1;
    else if (right.length > left.length) rightIndex += 1;
    else {
      leftIndex += 1;
      rightIndex += 1;
    }
  }

  if (leftIndex < left.length || rightIndex < right.length) differences += 1;
  return differences;
}
