import { RequestType } from '@prisma/client';

export type RequestFieldType = 'text' | 'textarea' | 'number' | 'date';
export interface RequestFieldRequirement { name: string; label: string; type: RequestFieldType; required: boolean; }
export interface RequestAttachmentRequirement {
  key: string;
  label: string;
  required: boolean;
  multiple?: boolean;
  minFiles?: number;
  pairGroup?: string;
}
export interface RequestRequirements { fields: RequestFieldRequirement[]; attachments: RequestAttachmentRequirement[]; }

const field = (name: string, label: string, type: RequestFieldType = 'text', required = true): RequestFieldRequirement => ({ name, label, type, required });
const required = (key: string, label: string, options: Pick<RequestAttachmentRequirement, 'multiple' | 'minFiles' | 'pairGroup'> = {}): RequestAttachmentRequirement => ({ key, label, required: true, ...options });
const optional = (key: string, label: string, options: Pick<RequestAttachmentRequirement, 'multiple' | 'minFiles' | 'pairGroup'> = {}): RequestAttachmentRequirement => ({ key, label, required: false, ...options });
const cinPair = (key: string, label: string, pairGroup = key, multiple = false) => [
  required(`${key}-recto`, `${label} (recto)`, { pairGroup, multiple }),
  required(`${key}-verso`, `${label} (verso)`, { pairGroup, multiple }),
];

export const requestRequirements: Record<RequestType, RequestRequirements> = {
  BIRTH_CERTIFICATE: {
    fields: [field('nomDemandeur', 'Nom et prénoms du demandeur'), field('cinDemandeur', 'CIN du demandeur'), field('adresseDemandeur', 'Adresse du demandeur', 'textarea'), field('lienAvecPersonne', 'Lien avec la personne concernée'), field('nom', 'Nom de la personne concernée'), field('prenoms', 'Prénoms de la personne concernée'), field('dateNaissance', 'Date de naissance', 'date'), field('lieuNaissance', 'Lieu de naissance'), field('nomPere', 'Nom du père'), field('nomMere', 'Nom de la mère'), field('anneeNumeroActe', 'Année / numéro de l’acte (si connu)', 'text', false)],
    attachments: [...cinPair('cin-demandeur', 'CIN du demandeur')],
  },
  RESIDENCE_CERTIFICATE: {
    fields: [field('nomComplet', 'Nom et prénoms'), field('dateNaissance', 'Date de naissance', 'date'), field('lieuNaissance', 'Lieu de naissance'), field('nomPere', 'Nom du père'), field('nomMere', 'Nom de la mère'), field('cin', 'Numéro CIN'), field('dateDelivranceCin', 'Date de délivrance de la CIN', 'date'), field('lieuDelivranceCin', 'Lieu de délivrance de la CIN'), field('adresse', 'Adresse actuelle', 'textarea'), field('lotLieuDit', 'Lot / lieu-dit')],
    attachments: [],
  },
  NATIONALITY_CERTIFICATE: {
    fields: [field('nom', 'Nom'), field('prenoms', 'Prénoms'), field('dateNaissance', 'Date de naissance', 'date'), field('lieuNaissance', 'Lieu de naissance'), field('nomPere', 'Nom du père'), field('nomMere', 'Nom de la mère'), field('cin', 'Numéro CIN'), field('dateDelivranceCin', 'Date de délivrance de la CIN', 'date'), field('adresseActuelle', 'Adresse actuelle', 'textarea')],
    attachments: [required('acte-naissance-integral', 'Copie intégrale de l’acte de naissance'), required('residence', 'Certificat de résidence'), optional('livret-parents', 'Livret de famille ou acte de mariage des parents (si applicable)'), required('acte-naissance-parent', 'Acte de naissance du père ou de la mère (si parents non mariés)')],
  },
  CIN_REQUEST: {
    fields: [field('nom', 'Nom et prénoms'), field('dateNaissance', 'Date de naissance', 'date'), field('lieuNaissance', 'Lieu de naissance'), field('nomPere', 'Nom du père'), field('nomMere', 'Nom de la mère'), field('adresse', 'Adresse actuelle', 'textarea'), field('profession', 'Profession'), field('telephone', 'Téléphone'), field('tailleCm', 'Taille (cm)', 'number')],
    attachments: [required('acte-naissance', 'Acte de naissance (moins d’un an)'), required('residence', 'Certificat de résidence (moins de 3 mois)'), required('photos', 'Photo d’identité 4 x 4', { minFiles: 1 })],
  },
  CIN_RENEWAL: {
    fields: [field('nom', 'Nom et prénoms'), field('cin', 'Ancien numéro de CIN'), field('dateDelivranceCin', 'Date de délivrance de l’ancienne CIN', 'date'), field('dateNaissance', 'Date de naissance', 'date'), field('adresse', 'Adresse actuelle', 'textarea'), field('motif', 'Motif (usure, perte ou autre)', 'textarea'), field('tailleCm', 'Taille (cm)', 'number')],
    attachments: [...cinPair('ancienne-cin', 'Ancienne CIN'), required('residence', 'Certificat de résidence'), required('photos', 'Photo d’identité 4 x 4'), optional('declaration-perte', 'Déclaration de perte (si applicable)')],
  },
  GOOD_CHARACTER_CERTIFICATE: {
    fields: [field('nom', 'Nom et prénoms'), field('dateNaissance', 'Date de naissance', 'date'), field('lieuNaissance', 'Lieu de naissance'), field('nomPere', 'Nom du père'), field('nomMere', 'Nom de la mère'), field('cin', 'Numéro CIN'), field('dateDelivranceCin', 'Date de délivrance de la CIN', 'date'), field('profession', 'Profession'), field('adresse', 'Domicile', 'textarea')],
    attachments: [...cinPair('cin-demandeur', 'CIN du demandeur'), required('residence', 'Certificat de résidence'), required('fokontany', 'Attestation du Fokontany')],
  },
  BUILDING_PERMIT: {
    fields: [field('nom', 'Nom et prénoms / raison sociale'), field('cinNif', 'CIN / NIF'), field('adresse', 'Adresse', 'textarea'), field('telephone', 'Téléphone'), field('natureProjet', 'Nature du projet', 'textarea'), field('adresseTerrain', 'Localisation du terrain', 'textarea'), field('referenceParcelle', 'Références cadastrales / titre'), field('surface', 'Surface à construire (m²)', 'number')],
    attachments: [required('situation-juridique', 'Certificat de situation juridique (moins de 3 mois)'), required('plan-topographique', 'Plan topographique'), required('plan-masse', 'Plan de masse'), required('plan-projet', 'Plan du projet'), required('demande-alignement', 'Demande d’alignement'), required('propriete', 'Titre de propriété')],
  },
  LAND_STATUS: {
    fields: [field('nom', 'Nom et prénoms'), field('cin', 'Numéro CIN'), field('adresse', 'Adresse', 'textarea'), field('referenceParcelle', 'Références du terrain (titre / cadastre)'), field('adresseTerrain', 'Localisation précise', 'textarea'), field('superficie', 'Superficie approximative'), field('motif', 'Motif de la demande', 'textarea')],
    attachments: [required('titre-foncier', 'Titre foncier ou certificat de situation juridique'), required('plan-situation', 'Plan de situation')],
  },
  COMMERCIAL_LICENSE: {
    fields: [field('nom', 'Nom et prénoms / raison sociale'), field('cinNif', 'CIN / NIF'), field('adresse', 'Adresse du local', 'textarea'), field('activite', 'Nature de l’activité'), field('formeJuridique', 'Forme juridique'), field('telephone', 'Téléphone')],
    attachments: [...cinPair('cin-demandeur', 'CIN du demandeur'), required('residence', 'Certificat de résidence'), required('statuts', 'Statuts de la société (si personne morale)'), required('plan-reperage', 'Plan de repérage'), required('bail-propriete', 'Titre de propriété ou contrat de bail'), optional('carte-statistique', 'Carte statistique (si existante)')],
  },
  VEHICLE_REGISTRATION: {
    fields: [field('nom', 'Nom et prénoms du propriétaire'), field('cin', 'Numéro CIN'), field('adresse', 'Adresse', 'textarea'), field('marqueModele', 'Marque / type du véhicule'), field('numeroChassis', 'Numéro de châssis'), field('ancienneCarteGrise', 'Ancienne carte grise (si mutation)', 'text', false), field('puissanceFiscale', 'Puissance fiscale')],
    attachments: [optional('carte-grise', 'Ancienne carte grise (si mutation)'), required('facture-vente', 'Facture d’achat ou acte de vente'), required('conformite', 'Certificat de conformité'), required('non-gage', 'Certificat de non-gage'), ...cinPair('cin-proprietaire', 'CIN du propriétaire'), required('residence', 'Certificat de résidence')],
  },
  LOSS_DECLARATION: {
    fields: [field('nom', 'Nom et prénoms'), field('cin', 'Numéro CIN'), field('adresse', 'Adresse', 'textarea'), field('materielsPerdus', 'Matériel perdu', 'textarea'), field('datePerte', 'Date approximative de la perte', 'date'), field('lieuCirconstances', 'Lieu / circonstances', 'textarea')],
    attachments: [...cinPair('cin-demandeur', 'CIN du demandeur')],
  },
  SIGNATURE_LEGALIZATION: {
    fields: [field('nom', 'Nom et prénoms'), field('cin', 'Numéro CIN'), field('adresse', 'Adresse', 'textarea'), field('document', 'Nature du document à légaliser'), field('nombreSignatures', 'Nombre de signatures à légaliser', 'number')],
    attachments: [required('document-original', 'Document original à légaliser'), ...cinPair('cin-signataire', 'CIN du signataire')],
  },
  COMPLAINT: {
    fields: [field('nom', 'Nom et prénoms'), field('cin', 'Numéro CIN'), field('adresse', 'Adresse', 'textarea'), field('telephone', 'Téléphone'), field('objet', 'Objet du signalement / réclamation'), field('description', 'Description détaillée', 'textarea')],
    attachments: [optional('justificatif', 'Photos ou documents justificatifs', { multiple: true })],
  },
  SPECIAL_REQUEST: {
    fields: [field('nom', 'Nom et prénoms'), field('cin', 'Numéro CIN'), field('adresse', 'Adresse', 'textarea'), field('telephone', 'Téléphone'), field('objet', 'Objet de la demande'), field('description', 'Exposé des motifs / description', 'textarea')],
    attachments: [optional('justificatif', 'Pièces justificatives selon le cas', { multiple: true })],
  },
  ASSOCIATION_DECLARATION: {
    fields: [field('nomAssociation', 'Dénomination de l’association / ONG'), field('sigle', 'Sigle'), field('objetSocial', 'Objet', 'textarea'), field('siege', 'Siège social', 'textarea'), field('nomPresident', 'Nom du président'), field('cinPresident', 'CIN du président'), field('adressePresident', 'Adresse du président', 'textarea'), field('telephonePresident', 'Téléphone du président')],
    attachments: [required('statuts', 'Statuts (3 exemplaires)', { multiple: true, minFiles: 3 }), required('pv-constitution', 'Procès-verbal de l’Assemblée Générale constitutive'), required('membres-cin-recto', 'Recto des CIN des membres du bureau', { multiple: true, minFiles: 1, pairGroup: 'membres-cin' }), required('membres-cin-verso', 'Verso des CIN des membres du bureau', { multiple: true, minFiles: 1, pairGroup: 'membres-cin' }), required('residence-president', 'Certificat de résidence du président'), required('fiche-administrateurs', 'Fiche de renseignement des administrateurs')],
  },
  EVENT_AUTHORIZATION: {
    fields: [field('nomOrganisateur', 'Nom et prénoms de l’organisateur'), field('cinOrganisateur', 'CIN de l’organisateur'), field('adresse', 'Adresse', 'textarea'), field('telephone', 'Téléphone'), field('natureEvenement', 'Nature de l’événement'), field('dateDebut', 'Date de début', 'date'), field('dateFin', 'Date de fin', 'date'), field('lieu', 'Lieu exact', 'textarea'), field('heureDebutFin', 'Heure de début / fin'), field('participants', 'Nombre estimé de participants', 'number')],
    attachments: [...cinPair('cin-organisateur', 'CIN de l’organisateur'), required('programme', 'Programme détaillé de l’événement'), optional('autorisation-lieu', 'Autorisation du propriétaire du lieu (si applicable)')],
  },
  ACCREDITATION: {
    fields: [field('nomDemandeur', 'Nom et prénoms / raison sociale'), field('cinNif', 'CIN / NIF'), field('adresse', 'Adresse', 'textarea'), field('typeAgrement', 'Type d’agrément demandé'), field('activite', 'Activité concernée'), field('telephone', 'Téléphone')],
    attachments: [required('statuts', 'Statuts'), required('cin-dirigeants-recto', 'Recto des CIN des dirigeants', { multiple: true, minFiles: 1, pairGroup: 'cin-dirigeants' }), required('cin-dirigeants-verso', 'Verso des CIN des dirigeants', { multiple: true, minFiles: 1, pairGroup: 'cin-dirigeants' }), required('justificatifs-activite', 'Justificatifs d’activité', { multiple: true, minFiles: 1 }), required('recepisse-ong', 'Récépissé de déclaration d’existence (si ONG)')],
  },
  ADMINISTRATIVE_AUTHORIZATION: {
    fields: [field('nom', 'Nom et prénoms'), field('cin', 'Numéro CIN'), field('adresse', 'Adresse', 'textarea'), field('telephone', 'Téléphone'), field('natureAutorisation', 'Nature de l’autorisation demandée'), field('description', 'Exposé des motifs', 'textarea')],
    attachments: [optional('justificatifs', 'Pièces justificatives selon le cas', { multiple: true })],
  },
};

export const getRequestRequirements = (type: RequestType) => requestRequirements[type];

export function getRequestCompleteness(
  type: RequestType,
  formData: Record<string, unknown>,
  attachments: Array<{ label?: string | null }>,
) {
  const requirements = getRequestRequirements(type);
  const missingFields = requirements.fields
    .filter((item) => item.required && (formData[item.name] === undefined || String(formData[item.name]).trim() === ''))
    .map((item) => item.label);
  const invalidFields = requirements.fields.flatMap((item) => {
    const value = formData[item.name];
    if (value === undefined || String(value).trim() === '') return [];
    if (item.type === 'date') {
      const date = String(value);
      const parsed = new Date(`${date}T00:00:00.000Z`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
        return [item.label];
      }
    }
    if (item.type === 'number' && !Number.isFinite(Number(value))) return [item.label];
    if (item.name.toLowerCase().includes('cin') && item.name !== 'cinNif' && !/^\d{12}$/.test(String(value).trim())) {
      return [item.label];
    }
    if (item.name === 'tailleCm' && (!Number.isInteger(Number(value)) || Number(value) < 100 || Number(value) > 250)) {
      return [item.label];
    }
    return [];
  });
  const missingAttachments = requirements.attachments
    .filter((item) => item.required && attachments.filter((attachment) => attachment.label === item.label).length < (item.minFiles ?? 1))
    .map((item) => item.label);
  return { missingFields, invalidFields, missingAttachments };
}
