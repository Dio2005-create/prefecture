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
    attachments: [required('certificat-accouchement', 'Certificat d’accouchement ou fiche CSB'), ...cinPair('cin-mere', 'CIN de la mère'), ...cinPair('cin-declarant', 'CIN du déclarant'), optional('livret-famille', 'Livret de famille (si disponible)')],
  },
  RESIDENCE_CERTIFICATE: {
    fields: [field('nomComplet', 'Nom et prénoms'), field('dateNaissance', 'Date de naissance', 'date'), field('lieuNaissance', 'Lieu de naissance'), field('nomPere', 'Nom du père'), field('nomMere', 'Nom de la mère'), field('cin', 'Numéro CIN'), field('dateDelivranceCin', 'Date de délivrance de la CIN', 'date'), field('lieuDelivranceCin', 'Lieu de délivrance de la CIN'), field('adresse', 'Adresse actuelle', 'textarea'), field('lotLieuDit', 'Lot / lieu-dit')],
    attachments: [...cinPair('cin-demandeur', 'CIN du demandeur'), required('domicile', 'Justificatif de domicile (facture JIRAMA, quittance ou attestation du propriétaire)')],
  },
  NATIONALITY_CERTIFICATE: {
    fields: [field('nom', 'Nom'), field('prenoms', 'Prénoms'), field('dateNaissance', 'Date de naissance', 'date'), field('lieuNaissance', 'Lieu de naissance'), field('nomPere', 'Nom du père'), field('nomMere', 'Nom de la mère'), field('cin', 'Numéro CIN'), field('dateDelivranceCin', 'Date de délivrance de la CIN', 'date'), field('adresseActuelle', 'Adresse actuelle', 'textarea')],
    attachments: [required('acte-naissance-integral', 'Copie intégrale de l’acte de naissance'), required('residence', 'Certificat de résidence'), optional('livret-parents', 'Livret de famille ou acte de mariage des parents (si applicable)'), required('acte-naissance-parent', 'Acte de naissance du père ou de la mère (si parents non mariés)')],
  },
  CIN_REQUEST: {
    fields: [field('nom', 'Nom et prénoms'), field('dateNaissance', 'Date de naissance', 'date'), field('lieuNaissance', 'Lieu de naissance'), field('nomPere', 'Nom du père'), field('nomMere', 'Nom de la mère'), field('adresse', 'Adresse actuelle', 'textarea'), field('profession', 'Profession'), field('telephone', 'Téléphone')],
    attachments: [required('acte-naissance', 'Acte de naissance certifié de moins d’un an'), required('residence', 'Certificat de résidence récent (moins de 3 mois)'), required('photos', 'Photos d’identité', { multiple: true, minFiles: 2 }), required('situation-familiale-parents', 'Déclaration de situation familiale des parents')],
  },
  CIN_RENEWAL: {
    fields: [field('nom', 'Nom et prénoms'), field('cin', 'Ancien numéro de CIN'), field('dateDelivranceCin', 'Date de délivrance de l’ancienne CIN', 'date'), field('dateNaissance', 'Date de naissance', 'date'), field('adresse', 'Adresse actuelle', 'textarea'), field('motif', 'Motif (usure, perte ou autre)', 'textarea')],
    attachments: [...cinPair('ancienne-cin', 'Ancienne CIN'), required('residence', 'Certificat de résidence'), required('photos', 'Photos d’identité', { multiple: true }), optional('declaration-perte', 'Déclaration de perte (si applicable)')],
  },
  GOOD_CHARACTER_CERTIFICATE: {
    fields: [field('nom', 'Nom et prénoms'), field('dateNaissance', 'Date de naissance', 'date'), field('lieuNaissance', 'Lieu de naissance'), field('nomPere', 'Nom du père'), field('nomMere', 'Nom de la mère'), field('cin', 'Numéro CIN'), field('dateDelivranceCin', 'Date de délivrance de la CIN', 'date'), field('profession', 'Profession'), field('adresse', 'Domicile', 'textarea')],
    attachments: [...cinPair('cin-demandeur', 'CIN du demandeur'), required('residence', 'Certificat de résidence'), required('fokontany', 'Attestation du Fokontany')],
  },
  BUILDING_PERMIT: {
    fields: [field('nom', 'Nom et prénoms / raison sociale'), field('cinNif', 'CIN / NIF'), field('adresse', 'Adresse', 'textarea'), field('telephone', 'Téléphone'), field('natureProjet', 'Nature du projet', 'textarea'), field('adresseTerrain', 'Localisation du terrain', 'textarea'), field('referenceParcelle', 'Références cadastrales / titre'), field('surface', 'Surface à construire (m²)', 'number')],
    attachments: [required('situation-juridique', 'Certificat de situation juridique (moins de 3 mois)'), required('plan-topographique', 'Plan topographique avec coordonnées Laborde'), required('plan-masse', 'Plan de masse'), required('plan-projet', 'Plan du projet'), required('demande-alignement', 'Demande d’alignement'), required('pv-alignement', 'PV d’alignement'), required('propriete', 'Titre de propriété ou justificatif de droit d’usage')],
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
    attachments: [required('carte-grise', 'Ancienne carte grise (si mutation)'), required('facture-vente', 'Facture d’achat ou acte de vente'), required('conformite', 'Certificat de conformité'), required('non-gage', 'Certificat de non-gage (moins de 3 mois)'), ...cinPair('cin-proprietaire', 'CIN du propriétaire'), required('residence', 'Certificat de résidence')],
  },
  LOSS_DECLARATION: {
    fields: [field('nom', 'Nom et prénoms'), field('cin', 'Numéro CIN'), field('adresse', 'Adresse', 'textarea'), field('typeDocument', 'Document perdu'), field('datePerte', 'Date approximative de la perte', 'date'), field('lieuCirconstances', 'Lieu / circonstances', 'textarea')],
    attachments: [...cinPair('cin-demandeur', 'CIN du demandeur'), required('declaration-commissariat', 'Déclaration de perte au commissariat ou à la gendarmerie (si déjà faite)')],
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
    attachments: [required('justificatif', 'Pièces justificatives selon le cas', { multiple: true })],
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
    attachments: [required('justificatifs', 'Pièces justificatives selon le cas', { multiple: true })],
  },
};

export const getRequestRequirements = (type: RequestType) => requestRequirements[type];
