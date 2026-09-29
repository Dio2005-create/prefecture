import { RequestType } from '@prisma/client';

export interface RequestFieldRequirement { name: string; label: string; }
export interface RequestAttachmentRequirement {
  key: string;
  label: string;
  required: boolean;
  multiple?: boolean;
  minFiles?: number;
  pairGroup?: string;
}
export interface RequestRequirements { fields: RequestFieldRequirement[]; attachments: RequestAttachmentRequirement[]; }

const required = (key: string, label: string, options: Pick<RequestAttachmentRequirement, 'multiple' | 'minFiles' | 'pairGroup'> = {}): RequestAttachmentRequirement => ({ key, label, required: true, ...options });
const optional = (key: string, label: string, options: Pick<RequestAttachmentRequirement, 'multiple' | 'minFiles' | 'pairGroup'> = {}): RequestAttachmentRequirement => ({ key, label, required: false, ...options });
const cinPair = (key: string, label: string, pairGroup = key, multiple = false) => [
  required(`${key}-recto`, `${label} (recto)`, { pairGroup, multiple }),
  required(`${key}-verso`, `${label} (verso)`, { pairGroup, multiple }),
];

export const requestRequirements: Record<RequestType, RequestRequirements> = {
  BIRTH_CERTIFICATE: {
    fields: [{ name: 'nom', label: 'Nom' }, { name: 'prenoms', label: 'Prénoms' }, { name: 'dateNaissance', label: 'Date de naissance' }, { name: 'lieuNaissance', label: 'Lieu de naissance' }, { name: 'nomPere', label: 'Nom du père' }, { name: 'nomMere', label: 'Nom de la mère' }],
    attachments: [required('certificat-accouchement', 'Certificat d’accouchement ou fiche CSB'), ...cinPair('cin-mere', 'CIN de la mère'), ...cinPair('cin-declarant', 'CIN du déclarant'), optional('livret-famille', 'Livret de famille (si disponible)')],
  },
  RESIDENCE_CERTIFICATE: {
    fields: [{ name: 'nomComplet', label: 'Nom complet' }, { name: 'adresse', label: 'Adresse exacte' }, { name: 'dureeResidence', label: 'Durée de résidence' }, { name: 'cin', label: 'Numéro CIN' }],
    attachments: [...cinPair('cin-demandeur', 'CIN du demandeur'), required('domicile', 'Justificatif de domicile (facture JIRAMA, quittance ou attestation du propriétaire)')],
  },
  NATIONALITY_CERTIFICATE: {
    fields: [{ name: 'nom', label: 'Nom' }, { name: 'prenoms', label: 'Prénoms' }, { name: 'dateNaissance', label: 'Date de naissance' }, { name: 'lieuNaissance', label: 'Lieu de naissance' }, { name: 'filiation', label: 'Filiation' }],
    attachments: [required('acte-naissance-integral', 'Copie intégrale de l’acte de naissance'), required('residence', 'Certificat de résidence'), optional('livret-parents', 'Livret de famille ou acte de mariage des parents (si applicable)'), required('acte-naissance-parent', 'Acte de naissance du père ou de la mère (si parents non mariés)')],
  },
  CIN_REQUEST: {
    fields: [{ name: 'nom', label: 'Nom' }, { name: 'prenoms', label: 'Prénoms' }, { name: 'dateNaissance', label: 'Date de naissance' }, { name: 'lieuNaissance', label: 'Lieu de naissance' }, { name: 'nomPere', label: 'Nom du père' }, { name: 'nomMere', label: 'Nom de la mère' }],
    attachments: [required('acte-naissance', 'Acte de naissance certifié de moins d’un an'), required('residence', 'Certificat de résidence récent (moins de 3 mois)'), required('photos', 'Photos d’identité', { multiple: true, minFiles: 2 }), required('situation-familiale-parents', 'Déclaration de situation familiale des parents')],
  },
  CIN_RENEWAL: {
    fields: [{ name: 'nom', label: 'Nom' }, { name: 'prenoms', label: 'Prénoms' }, { name: 'dateNaissance', label: 'Date de naissance' }, { name: 'cin', label: 'Ancien numéro de CIN' }, { name: 'motif', label: 'Nouvelles informations ou motif de renouvellement' }],
    attachments: [...cinPair('ancienne-cin', 'Ancienne CIN'), required('residence', 'Certificat de résidence'), required('photos', 'Photos d’identité', { multiple: true }), optional('declaration-perte', 'Déclaration de perte (si applicable)')],
  },
  GOOD_CHARACTER_CERTIFICATE: {
    fields: [{ name: 'nom', label: 'Nom' }, { name: 'prenoms', label: 'Prénoms' }, { name: 'cin', label: 'CIN' }, { name: 'adresse', label: 'Adresse' }, { name: 'periode', label: 'Période concernée' }],
    attachments: [...cinPair('cin-demandeur', 'CIN du demandeur'), required('residence', 'Certificat de résidence'), required('fokontany', 'Attestation du Fokontany')],
  },
  BUILDING_PERMIT: {
    fields: [{ name: 'nom', label: 'Nom du propriétaire' }, { name: 'cin', label: 'CIN du propriétaire' }, { name: 'adresseTerrain', label: 'Localisation du terrain' }, { name: 'natureProjet', label: 'Nature du projet' }],
    attachments: [required('situation-juridique', 'Certificat de situation juridique (moins de 3 mois)'), required('plan-topographique', 'Plan topographique avec coordonnées Laborde'), required('plan-masse', 'Plan de masse'), required('plan-projet', 'Plan du projet'), required('demande-alignement', 'Demande d’alignement'), required('pv-alignement', 'PV d’alignement'), required('propriete', 'Titre de propriété ou justificatif de droit d’usage')],
  },
  LAND_STATUS: {
    fields: [{ name: 'referenceParcelle', label: 'Références cadastrales ou titre' }, { name: 'adresseTerrain', label: 'Localisation du terrain' }],
    attachments: [required('titre-foncier', 'Titre foncier ou certificat de situation juridique'), required('plan-situation', 'Plan de situation')],
  },
  COMMERCIAL_LICENSE: {
    fields: [{ name: 'nom', label: 'Identité du demandeur' }, { name: 'activite', label: 'Nature de l’activité' }, { name: 'adresse', label: 'Adresse du local' }],
    attachments: [...cinPair('cin-demandeur', 'CIN du demandeur'), required('residence', 'Certificat de résidence'), required('statuts', 'Statuts de la société (si personne morale)'), required('plan-reperage', 'Plan de repérage'), required('bail-propriete', 'Titre de propriété ou contrat de bail'), optional('carte-statistique', 'Carte statistique (si existante)')],
  },
  VEHICLE_REGISTRATION: {
    fields: [{ name: 'nom', label: 'Nom du propriétaire' }, { name: 'cin', label: 'CIN du propriétaire' }, { name: 'immatriculation', label: 'Immatriculation' }, { name: 'marqueModele', label: 'Marque et modèle' }],
    attachments: [required('carte-grise', 'Ancienne carte grise (si mutation)'), required('facture-vente', 'Facture d’achat ou acte de vente'), required('conformite', 'Certificat de conformité'), required('non-gage', 'Certificat de non-gage (moins de 3 mois)'), ...cinPair('cin-proprietaire', 'CIN du propriétaire'), required('residence', 'Certificat de résidence')],
  },
  LOSS_DECLARATION: {
    fields: [{ name: 'typeDocument', label: 'Type de document perdu' }, { name: 'circonstances', label: 'Circonstances' }, { name: 'datePerte', label: 'Date de perte' }],
    attachments: [...cinPair('cin-demandeur', 'CIN du demandeur'), required('declaration-commissariat', 'Déclaration de perte au commissariat ou à la gendarmerie (si déjà faite)')],
  },
  SIGNATURE_LEGALIZATION: {
    fields: [{ name: 'nom', label: 'Nom du signataire' }, { name: 'prenoms', label: 'Prénoms du signataire' }, { name: 'document', label: 'Nature du document' }],
    attachments: [required('document-original', 'Document original à légaliser'), ...cinPair('cin-signataire', 'CIN du signataire')],
  },
  COMPLAINT: {
    fields: [{ name: 'objet', label: 'Objet du signalement' }, { name: 'description', label: 'Description détaillée' }],
    attachments: [optional('justificatif', 'Photos ou documents justificatifs', { multiple: true })],
  },
  SPECIAL_REQUEST: {
    fields: [{ name: 'objet', label: 'Objet' }, { name: 'description', label: 'Description' }],
    attachments: [required('justificatif', 'Pièces justificatives selon le cas', { multiple: true })],
  },
  ASSOCIATION_DECLARATION: {
    fields: [{ name: 'nomAssociation', label: 'Nom de l’association ou ONG' }, { name: 'objetSocial', label: 'Objet social' }, { name: 'membresFondateurs', label: 'Membres fondateurs' }, { name: 'siege', label: 'Siège' }],
    attachments: [required('statuts', 'Statuts (3 exemplaires)', { multiple: true, minFiles: 3 }), required('pv-constitution', 'Procès-verbal de l’Assemblée Générale constitutive'), required('membres-cin-recto', 'Recto des CIN des membres du bureau', { multiple: true, minFiles: 1, pairGroup: 'membres-cin' }), required('membres-cin-verso', 'Verso des CIN des membres du bureau', { multiple: true, minFiles: 1, pairGroup: 'membres-cin' }), required('residence-president', 'Certificat de résidence du président'), required('fiche-administrateurs', 'Fiche de renseignement des administrateurs')],
  },
  EVENT_AUTHORIZATION: {
    fields: [{ name: 'natureEvenement', label: 'Nature de l’événement' }, { name: 'dateDebut', label: 'Date' }, { name: 'lieu', label: 'Lieu' }, { name: 'organisateur', label: 'Organisateur' }],
    attachments: [...cinPair('cin-organisateur', 'CIN de l’organisateur'), required('programme', 'Programme détaillé de l’événement'), optional('autorisation-lieu', 'Autorisation du propriétaire du lieu (si applicable)')],
  },
  ACCREDITATION: {
    fields: [{ name: 'typeAgrement', label: 'Type d’agrément demandé' }, { name: 'nomStructure', label: 'Nom de la structure' }, { name: 'activite', label: 'Activité' }],
    attachments: [required('statuts', 'Statuts'), required('cin-dirigeants-recto', 'Recto des CIN des dirigeants', { multiple: true, minFiles: 1, pairGroup: 'cin-dirigeants' }), required('cin-dirigeants-verso', 'Verso des CIN des dirigeants', { multiple: true, minFiles: 1, pairGroup: 'cin-dirigeants' }), required('justificatifs-activite', 'Justificatifs d’activité', { multiple: true, minFiles: 1 }), required('recepisse-ong', 'Récépissé de déclaration d’existence (si ONG)')],
  },
  ADMINISTRATIVE_AUTHORIZATION: {
    fields: [{ name: 'objet', label: 'Objet de l’autorisation' }, { name: 'description', label: 'Description et précisions utiles' }],
    attachments: [required('justificatifs', 'Pièces justificatives selon le cas', { multiple: true })],
  },
};

export const getRequestRequirements = (type: RequestType) => requestRequirements[type];
