import { useState } from 'react';
import axios from 'axios';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCw, Eye, Download, Pencil, Save, X } from 'lucide-react';
import { prefectureService } from '../services/api';
import { Pagination } from '../components/ui';
import type { RequestAttachmentRequirement, RequestType, RequestRequirements } from '../types';
import { usePreferences } from '../preferences';

const requestTypeByServiceCode: Record<string, RequestType> = {
  BC: 'BIRTH_CERTIFICATE',
  CR: 'RESIDENCE_CERTIFICATE',
  CIN: 'CIN_REQUEST',
  AP: 'BUILDING_PERMIT',
  LS: 'LAND_STATUS',
  BCC: 'GOOD_CHARACTER_CERTIFICATE',
  VR: 'VEHICLE_REGISTRATION',
  DL: 'LOSS_DECLARATION',
  ASSOC: 'ASSOCIATION_DECLARATION',
  MANIF: 'EVENT_AUTHORIZATION',
  AGREMENT: 'ACCREDITATION',
  AUTRE: 'ADMINISTRATIVE_AUTHORIZATION',
  RECLAMATION: 'COMPLAINT',
};

const requestLabels: Record<RequestType, string> = {
  BIRTH_CERTIFICATE: 'Acte de naissance',
  RESIDENCE_CERTIFICATE: 'Certificat de résidence',
  NATIONALITY_CERTIFICATE: 'Certificat de nationalité',
  CIN_REQUEST: 'Demande de CIN',
  CIN_RENEWAL: 'Renouvellement de CIN',
  GOOD_CHARACTER_CERTIFICATE: 'Certificat de bonne vie et mœurs',
  BUILDING_PERMIT: 'Permis de construire',
  LAND_STATUS: 'Situation foncière',
  COMMERCIAL_LICENSE: 'Licence commerciale',
  VEHICLE_REGISTRATION: 'Immatriculation véhicule',
  LOSS_DECLARATION: 'Déclaration de perte',
  SIGNATURE_LEGALIZATION: 'Légalisation de signature',
  COMPLAINT: 'Signalement ou réclamation',
  SPECIAL_REQUEST: 'Demande particulière',
  ASSOCIATION_DECLARATION: 'Déclaration d’association / ONG',
  EVENT_AUTHORIZATION: 'Autorisation de manifestation / foire / quête',
  ACCREDITATION: 'Demande d’agrément',
  ADMINISTRATIVE_AUTHORIZATION: 'Autre autorisation administrative',
};

type AttachmentRequirement = RequestAttachmentRequirement;

function getRequestErrorMessage(error: unknown) {
  if (axios.isAxiosError(error)) {
    const responseMessage = (error.response?.data as { message?: string | string[] } | undefined)?.message;
    if (Array.isArray(responseMessage)) return responseMessage.join(', ');
    if (responseMessage) return responseMessage;
  }
  return error instanceof Error ? error.message : 'La demande n’a pas pu être envoyée.';
}

const statusLabels: Record<string, string> = {
  DRAFT: 'Brouillon', SUBMITTED: 'Reçu', IN_REVIEW: 'En instruction', IN_PROGRESS: 'En instruction',
  NEEDS_INFO: 'Complément demandé', APPROVED: 'Validé', REJECTED: 'Rejeté', ARCHIVED: 'Archivé',
  PENDING_PREFECT: 'En attente de validation', PENDING_CHIEF: 'En attente de validation', PENDING_PAYMENT: 'En instruction',
};

const statusClassNames: Record<string, string> = {
  APPROVED: 'valide', REJECTED: 'erreur', NEEDS_INFO: 'en_traitement', PENDING_PREFECT: 'en_traitement',
};

type MobileMoneyProvider = 'MVOLA' | 'AIRTEL_MONEY' | 'ORANGE_MONEY';
const mobileMoneyPrefixes: Record<MobileMoneyProvider, string[]> = {
  MVOLA: ['034', '038', '036'],
  AIRTEL_MONEY: ['033', '035'],
  ORANGE_MONEY: ['032', '037'],
};

function formatStatus(status: string) {
  return statusLabels[status] ?? status.replace(/_/g, ' ').toLowerCase();
}

function renderValue(value: unknown) {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.join(', ');
  if (value && typeof value === 'object') return JSON.stringify(value);
  return '—';
}

export function RequestPage() {
  const { t, language } = usePreferences();
  const queryClient = useQueryClient();
  const [requestType, setRequestType] = useState<RequestType>('BIRTH_CERTIFICATE');
  const { data: services = [], isLoading } = useQuery({
    queryKey: ['prefecture-services'],
    queryFn: prefectureService.listServices,
  });

  const { data: dynamicRequirements, isLoading: loadingRequirements, isError: requirementsError } = useQuery<RequestRequirements>({
    queryKey: ['request-requirements', requestType],
    queryFn: () => prefectureService.requirements(requestType),
  });
  const { data: fees = {}, isLoading: loadingFees, isError: feesError } = useQuery({
    queryKey: ['prefecture-fees'],
    queryFn: prefectureService.listFees,
    refetchInterval: 5000,
  });

  const { data: requests = [], refetch: refetchRequests, isFetching: refreshingRequests } = useQuery({
    queryKey: ['citizen-requests'],
    queryFn: prefectureService.listRequests,
    refetchInterval: 3000,
  });
  const [editingRequest, setEditingRequest] = useState<(typeof requests)[number] | null>(null);
  const [expandedRequestId, setExpandedRequestId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editFormData, setEditFormData] = useState<Record<string, string>>({});
  const [editAttachmentLabel, setEditAttachmentLabel] = useState('');
  const [editAttachmentId, setEditAttachmentId] = useState('');
  const [editAttachmentFile, setEditAttachmentFile] = useState<File | null>(null);
  const [editError, setEditError] = useState('');
  const { data: editRequirements, isLoading: loadingEditRequirements } = useQuery<RequestRequirements>({
    queryKey: ['request-requirements', editingRequest?.type],
    queryFn: () => prefectureService.requirements(editingRequest!.type as RequestType),
    enabled: Boolean(editingRequest),
  });
  const expandedRequest = requests.find((request) => request.id === expandedRequestId);
  const { data: displayRequirements } = useQuery<RequestRequirements>({
    queryKey: ['request-requirements', expandedRequest?.type],
    queryFn: () => prefectureService.requirements(expandedRequest!.type as RequestType),
    enabled: Boolean(expandedRequest),
  });

  const [selectedServiceId, setSelectedServiceId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [selectedFiles, setSelectedFiles] = useState<Array<{ requirement: string; file: File }>>([]);
  const [submitError, setSubmitError] = useState('');
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentProvider, setPaymentProvider] = useState<MobileMoneyProvider>('MVOLA');
  const [paymentPhone, setPaymentPhone] = useState('');
  const [paymentPin, setPaymentPin] = useState('');
  const [paymentValidationError, setPaymentValidationError] = useState('');
  const [requestError, setRequestError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formValidationAttempted, setFormValidationAttempted] = useState(false);
  const [requestPage, setRequestPage] = useState(1);
  const visibleRequests = requests.slice((requestPage - 1) * 5, requestPage * 5);
  const formFields = dynamicRequirements?.fields ?? [];
  const requiredAttachments = dynamicRequirements?.attachments ?? [];
  const requestFee = Number(fees[requestType] ?? 0);
  const todayDate = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
  const requiredAttachmentsAreValid = requiredAttachments.every((requirement) =>
    !requirement.required || selectedFiles.filter((item) => item.requirement === requirement.label).length >= (requirement.minFiles ?? 1),
  );
  const missingAttachments = requiredAttachments.filter((requirement) =>
    requirement.required && selectedFiles.filter((item) => item.requirement === requirement.label).length < (requirement.minFiles ?? 1),
  );
  const requestFormWarnings: string[] = [];
  if (!selectedServiceId) requestFormWarnings.push(t('Sélectionnez un service avant de continuer.'));
  if (loadingRequirements) requestFormWarnings.push(t('Chargement des champs obligatoires…'));
  if (requirementsError) requestFormWarnings.push(t('Impossible de charger les pièces exigées. Actualisez la page avant de soumettre.'));
  formFields.forEach((field) => {
    const value = formData[field.name]?.trim() ?? '';
    if (field.required && !value) requestFormWarnings.push(`${t(field.label)} : ${t('Ce champ est obligatoire.')}`);
    if (value && field.name.toLowerCase().includes('cin') && field.name !== 'cinNif' && !/^\d{12}$/.test(value)) {
      requestFormWarnings.push(`${t(field.label)} : ${t('La CIN doit contenir exactement 12 chiffres.')}`);
    }
    if (field.name === 'datePerte' && value && value > todayDate) {
      requestFormWarnings.push(`${t(field.label)} : ${t('La date de perte ne peut pas être dans le futur.')}`);
    }
    if (field.name === 'tailleCm' && value && (!/^\d+$/.test(value) || Number(value) < 100 || Number(value) > 250)) {
      requestFormWarnings.push(`${t(field.label)} : ${t('Saisissez la taille en centimètres, entre 100 et 250 (par exemple 174 pour 1,74 m).')}`);
    }
  });
  if ((requestType === 'CIN_REQUEST' || requestType === 'CIN_RENEWAL') && formData.dateNaissance) {
    const birthDate = new Date(`${formData.dateNaissance}T00:00:00.000Z`);
    const today = new Date();
    let age = today.getUTCFullYear() - birthDate.getUTCFullYear();
    if (today.getUTCMonth() < birthDate.getUTCMonth() || (today.getUTCMonth() === birthDate.getUTCMonth() && today.getUTCDate() < birthDate.getUTCDate())) age -= 1;
    if (!Number.isNaN(birthDate.getTime()) && age < 18) requestFormWarnings.push(t('La demande de CIN est réservée aux personnes âgées de 18 ans et plus.'));
  }
  missingAttachments.forEach((requirement) => {
    const count = selectedFiles.filter((file) => file.requirement === requirement.label).length;
    requestFormWarnings.push(`${t(requirement.label)} : ${t('Pièce justificative obligatoire manquante')} (${count}/${requirement.minFiles ?? 1}).`);
  });
  const requestFormIsValid = requestFormWarnings.length === 0 && requiredAttachmentsAreValid && !loadingRequirements && !requirementsError;
  const paymentPhoneIsValid = /^\d{10}$/.test(paymentPhone)
    && mobileMoneyPrefixes[paymentProvider].some((prefix) => paymentPhone.startsWith(prefix));
  const paymentPinIsValid = paymentPin === '1234';
  const paymentWarnings = [
    ...(loadingFees ? [t('Chargement du tarif…')] : []),
    ...(feesError || !Number.isFinite(requestFee) ? [t('Le tarif est indisponible. Actualisez la page avant de réessayer.')] : []),
    ...(requestFee > 0 ? [
    ...(!paymentPhone ? [t('Le numéro de téléphone est obligatoire.')] : !paymentPhoneIsValid ? [t('Le numéro doit contenir 10 chiffres et respecter le préfixe de l’opérateur choisi.')] : []),
      ...(!paymentPin ? [t('Le code PIN de simulation est obligatoire.')] : !paymentPinIsValid ? [t('PIN incorrect : utilisez le code de démonstration 1234.')] : []),
    ] : []),
  ];

  const mutation = useMutation({
    mutationFn: prefectureService.createMultipartRequest,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['citizen-requests'] });
      setSelectedServiceId('');
      setTitle('');
      setDescription('');
      setFormData({});
      setSelectedFiles([]);
      setSubmitError('');
      setPaymentModalOpen(false);
      setPaymentPhone('');
      setPaymentPin('');
      setPaymentValidationError('');
      setFormValidationAttempted(false);
    },
    onError: (error) => setSubmitError(getRequestErrorMessage(error)),
  });
  const editMutation = useMutation({
    mutationFn: async () => {
      if (!editingRequest) throw new Error('Aucune demande sélectionnée.');
      const saved = await prefectureService.updateCitizenRequest(editingRequest.id, {
        title: editTitle,
        description: editDescription,
        formData: editFormData,
      });
      if (editAttachmentFile && editAttachmentId) {
        await prefectureService.replaceCitizenAttachment(editingRequest.id, editAttachmentId, editAttachmentFile);
      } else if (editAttachmentFile && editAttachmentLabel) {
        await prefectureService.addCitizenAttachment(editingRequest.id, editAttachmentFile, editAttachmentLabel);
      }
      return saved;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['citizen-requests'] });
      setEditingRequest(null);
      setEditAttachmentFile(null);
      setEditAttachmentLabel('');
      setEditAttachmentId('');
      setEditError('');
    },
    onError: (error) => setEditError(getRequestErrorMessage(error)),
  });

  const confirmSimulatedPayment = () => {
    if (!requestFormIsValid) {
      setPaymentValidationError('Veuillez corriger les champs et pièces justificatives signalés avant de payer.');
      return;
    }
    if (loadingFees || feesError || !Number.isFinite(requestFee)) {
      setPaymentValidationError('Le tarif configuré est indisponible. Réessayez après actualisation.');
      return;
    }
    if (requestFee > 0 && !paymentPhoneIsValid) {
      setPaymentValidationError('Saisissez 10 chiffres avec un préfixe valide.');
      return;
    }
    if (requestFee > 0 && !paymentPinIsValid) {
      setPaymentValidationError('PIN incorrect : utilisez le code de démonstration 1234.');
      return;
    }
    setPaymentValidationError('');
    mutation.mutate({
      serviceId: selectedServiceId,
      type: requestType,
      title: title || requestLabels[requestType],
      description: description || 'Dossier soumis avec formulaire dynamique.',
      formData,
      files: selectedFiles,
      paymentConfirmed: true,
      confirmedAmount: requestFee,
      ...(requestFee > 0 ? { paymentProvider, paymentPhone } : {}),
      ...(requestFee > 0 ? { simulationPin: paymentPin } : {}),
    });
  };

  const handleTypeChange = (type: RequestType) => {
    setRequestType(type);
    setFormData({});
    setSelectedFiles([]);
  };

  const beginEditingRequest = (request: (typeof requests)[number]) => {
    const values = request.formData && typeof request.formData === 'object' ? request.formData : {};
    setEditingRequest(request);
    setEditTitle(request.title ?? '');
    setEditDescription(request.description ?? '');
    setEditFormData(Object.fromEntries(Object.entries(values).map(([key, value]) => [key, renderValue(value) === '—' ? '' : renderValue(value)])));
    setEditAttachmentFile(null);
    setEditAttachmentLabel('');
    setEditAttachmentId('');
    setEditError('');
  };

  const downloadRequestAttachment = async (requestId: string, attachmentId: string, fileName: string) => {
    try {
      const blob = await prefectureService.downloadAttachment(requestId, attachmentId);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setRequestError(getRequestErrorMessage(error));
    }
  };

  const citizenCanEdit = (status: string) => !['APPROVED', 'REJECTED', 'ARCHIVED', 'CANCELLED'].includes(status);

  const handleFiles = (requirement: AttachmentRequirement, files: FileList | null) => {
    const nextFiles = Array.from(files ?? []).map((file) => ({ requirement: requirement.label, file }));
    setSelectedFiles((previous) => [...previous.filter((item) => item.requirement !== requirement.label), ...nextFiles]);
  };

  const previewFile = (file: File) => {
    const url = URL.createObjectURL(file);
    window.open(url, '_blank', 'noopener,noreferrer');
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  const submitRequest = () => {
    setFormValidationAttempted(true);
    if (loadingFees || feesError || !Number.isFinite(requestFee)) {
      setSubmitError('Impossible de charger le tarif configuré. Réessayez avant de soumettre.');
      return;
    }
    const errors: Record<string, string> = {};
    formFields.forEach((field) => {
      const value = formData[field.name]?.trim() ?? '';
      if (field.required && !value) errors[field.name] = 'Ce champ est obligatoire.';
      if (value && field.name.toLowerCase().includes('cin') && field.name !== 'cinNif' && !/^\d{12}$/.test(value)) errors[field.name] = 'La CIN doit contenir exactement 12 chiffres.';
      if (field.name === 'datePerte' && value && value > todayDate) errors[field.name] = 'La date de perte ne peut pas être dans le futur.';
    });
    if ((requestType === 'CIN_REQUEST' || requestType === 'CIN_RENEWAL') && formData.dateNaissance) {
      const birthDate = new Date(`${formData.dateNaissance}T00:00:00.000Z`);
      const today = new Date();
      let age = today.getUTCFullYear() - birthDate.getUTCFullYear();
      if (today.getUTCMonth() < birthDate.getUTCMonth() || (today.getUTCMonth() === birthDate.getUTCMonth() && today.getUTCDate() < birthDate.getUTCDate())) age -= 1;
      if (!Number.isNaN(birthDate.getTime()) && age < 18) errors.dateNaissance = 'La demande de CIN est réservée aux personnes âgées de 18 ans et plus.';
    }
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) { setSubmitError('Corrigez les champs signalés avant de continuer.'); return; }
    if (missingAttachments.length > 0) {
      setSubmitError(`Pièces obligatoires manquantes : ${missingAttachments.map((item) => `${t(item.label)}${(item.minFiles ?? 1) > 1 ? ` (${selectedFiles.filter((file) => file.requirement === item.label).length}/${item.minFiles} ${t('fichier(s) fourni(s)')})` : ''}`).join(', ')}`);
      return;
    }
    if (!selectedServiceId) {
      setSubmitError('Sélectionnez un service avant de continuer.');
      return;
    }
    setSubmitError('');
    setPaymentModalOpen(true);
  };

  return (
    <div className="request-page">
      <div className="panel request-form-panel">
        <div className="request-form-header"><div><p className="eyebrow">{t('Démarche en ligne')}</p><h2>{t('Nouvelle demande')}</h2><p>{t('Renseignez les informations nécessaires à l’instruction de votre dossier.')}</p></div><span className="request-form-badge">{t('Formulaire sécurisé')}</span></div>
        <div className="request-form">
          <section className="request-form-section"><h3>{t('Choisir la démarche')}</h3><div className="request-form-grid">
          <label className="request-field">
            {t('Service')}
            <select value={selectedServiceId} onChange={(e) => {
              const nextServiceId = e.target.value;
              const service = services.find((item) => item.id === nextServiceId);
              setSelectedServiceId(nextServiceId);
              if (service && requestTypeByServiceCode[service.code]) handleTypeChange(requestTypeByServiceCode[service.code]);
            }}>
              <option value="">{t('Choisir un service')}</option>
              {services.map((service) => (
                <option key={service.id} value={service.id}>{language === 'mg' ? service.nameMg : service.nameFr}</option>
              ))}
            </select>
          </label>

          <label className="request-field">
            {t('Type de démarche')}
            <select value={requestType} onChange={(e) => handleTypeChange(e.target.value as RequestType)}>
              {Object.entries(requestLabels).map(([value, label]) => (
                <option key={value} value={value}>{t(label)}</option>
              ))}
            </select>
          </label></div></section>

          <section className="request-form-section"><h3>{t('Objet du dossier')}</h3><label className="request-field">
            {t('Objet')}
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t(requestLabels[requestType])} />
          </label></section>

          <section className="request-form-section"><h3>{t('Informations demandées')}</h3><div className="request-form-grid">
            {formFields.map((field) => (
              <label className={`request-field ${field.type === 'textarea' ? 'full-width' : ''}`} key={field.name}>
                {t(field.label)}{field.required ? ' *' : ''}
                {field.type === 'textarea' ? (
                  <textarea
                    required={field.required}
                    value={formData[field.name] ?? ''}
                    onChange={(e) => { setFormData((prev) => ({ ...prev, [field.name]: e.target.value })); setFieldErrors((prev) => ({ ...prev, [field.name]: '' })); }}
                    rows={3}
                    placeholder={field.name === 'materielsPerdus' ? t('Indiquez chaque matériel perdu sur une ligne') : t(field.label)}
                  />
                ) : (
                  <input
                    type={field.type}
                    min={field.name === 'tailleCm' ? 100 : undefined}
                    max={field.name === 'tailleCm' ? 250 : field.name === 'datePerte' ? todayDate : undefined}
                    step={field.name === 'tailleCm' ? 1 : undefined}
                    required={field.required}
                    value={formData[field.name] ?? ''}
                    onChange={(e) => { setFormData((prev) => ({ ...prev, [field.name]: e.target.value })); setFieldErrors((prev) => ({ ...prev, [field.name]: '' })); }}
                    placeholder={field.name === 'materielsPerdus' ? t('Indiquez chaque matériel perdu sur une ligne') : t(field.label)}
                  />
                )}
                {fieldErrors[field.name] && <small className="field-warning" role="alert">{t(fieldErrors[field.name])}</small>}
              </label>
            ))}
          </div></section>

          <section className="request-form-section"><h3>{t('Pièces justificatives')}</h3><p className="form-hint">{t('Formats acceptés : PDF, JPG et PNG. Les pièces marquées d’un astérisque sont obligatoires ; les autres sont facultatives.')}</p>{requirementsError && <p className="error-message" role="alert">{t('Impossible de charger les pièces exigées. Actualisez la page avant de soumettre.')}</p>}<div className="request-form-grid">
            {requiredAttachments.map((requirement) => {
              const files = selectedFiles.filter((item) => item.requirement === requirement.label);
              return <div className="request-field full-width" key={requirement.key}>
                <label>{t(requirement.label)}{requirement.required ? ' *' : ` (${t('facultatif')})`}
                  <input type="file" accept={requirement.label === 'Photo d’identité 4 x 4' ? 'image/jpeg,image/png,.jpg,.jpeg,.png' : 'application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png'} multiple={requirement.multiple} required={requirement.required && files.length < (requirement.minFiles ?? 1)} onChange={(event) => handleFiles(requirement, event.target.files)} />
                </label>
                {files.length > 0 && <div className="file-preview">{files.map((item) => <span key={`${requirement.key}-${item.file.name}`} style={{ display: 'flex', alignItems: 'center', gap: 8 }}><small>{item.file.name} ({Math.ceil(item.file.size / 1024)} Ko)</small><button type="button" className="button small" onClick={() => previewFile(item.file)}><Eye size={13} /> {t('Aperçu')}</button></span>)}</div>}
              </div>;
            })}
          </div></section>

          <section className="request-form-section"><h3>{t('Informations complémentaires')}</h3><label className="request-field full-width">
            {t('Description complémentaire')}
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} placeholder={t('Décrivez votre demande ou précisez les informations utiles')} />
          </label></section>

          {submitError && <p className="error-message" role="alert">{t(submitError)}</p>}
          {formValidationAttempted && Object.keys(fieldErrors).length > 0 && <ul className="field-warning" role="alert">{Object.entries(fieldErrors).map(([name, message]) => {
            const field = formFields.find((item) => item.name === name);
            return <li key={name}>{field ? t(field.label) : name} — {t(message)}</li>;
          })}</ul>}
          {requestError && <p className="error-message" role="alert">{t(requestError)}</p>}
          <button
            className="button primary request-submit"
            disabled={!selectedServiceId || mutation.isPending || loadingRequirements || requirementsError}
            onClick={submitRequest}
          >
            {t(mutation.isPending ? 'Envoi...' : 'Soumettre la demande')}
          </button>
        </div>
      </div>

        {paymentModalOpen && <div className="modal-backdrop payment-backdrop" role="presentation"><section className="confirm-modal payment-modal" role="dialog" aria-modal="true" aria-labelledby="payment-title" aria-describedby="payment-description">
          <p className="eyebrow">{t('Étape de paiement')}</p>
          <h2 id="payment-title">{t('Confirmer le paiement')}</h2>
          <p id="payment-description">{t(requestLabels[requestType])} · {requestFee.toLocaleString(language === 'mg' ? 'mg-MG' : 'fr-FR')} Ar</p>
          <p className="payment-demo-notice">{t('Mode démonstration : aucun débit réel n’est effectué. PIN de test : 1234. Le dossier est transmis après validation.')}</p>
          {requestFee > 0 && <div className="payment-fields">
            <label className="request-field">{t('Opérateur')}<select value={paymentProvider} onChange={(event) => { setPaymentProvider(event.target.value as MobileMoneyProvider); setPaymentPhone(''); setPaymentPin(''); setPaymentValidationError(''); }}><option value="MVOLA">MVola</option><option value="AIRTEL_MONEY">Airtel Money</option><option value="ORANGE_MONEY">Orange Money</option></select></label>
            <label className="request-field">{t('Numéro du citoyen (10 chiffres)')}<input type="tel" inputMode="numeric" autoComplete="tel-national" value={paymentPhone} maxLength={10} placeholder={paymentProvider === 'MVOLA' ? '0340000000' : paymentProvider === 'AIRTEL_MONEY' ? '0330000000' : '0320000000'} aria-invalid={Boolean(paymentPhone) && !paymentPhoneIsValid} onChange={(event) => { setPaymentPhone(event.target.value.replace(/\D/g, '').slice(0, 10)); setPaymentValidationError(''); }} />{paymentPhone && !paymentPhoneIsValid && <small className="field-warning" role="status">{t('Le numéro doit contenir 10 chiffres et respecter le préfixe de l’opérateur choisi.')}</small>}</label>
            <label className="request-field">{t('Code PIN de simulation (4 chiffres)')}<input type="password" inputMode="numeric" autoComplete="one-time-code" value={paymentPin} maxLength={4} aria-invalid={Boolean(paymentPin) && !paymentPinIsValid} onChange={(event) => { setPaymentPin(event.target.value.replace(/\D/g, '').slice(0, 4)); setPaymentValidationError(''); }} />{paymentPin && !paymentPinIsValid && <small className="field-warning" role="status">{t('PIN incorrect : utilisez le code de démonstration 1234.')}</small>}</label>
            <small className="form-hint">{t('Préfixes autorisés :')} {paymentProvider === 'MVOLA' ? '034, 038 ou 036' : paymentProvider === 'AIRTEL_MONEY' ? '033 ou 035' : '032 ou 037'}.</small>
          </div>}
          {paymentValidationError && <p className="error-message" role="alert">{t(paymentValidationError)}</p>}
          {!requestFormIsValid && <div className="field-warning" role="alert"><strong>{t('Vérifiez les informations avant de payer :')}</strong><ul>{requestFormWarnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></div>}
          {paymentWarnings.length > 0 && <ul className="field-warning payment-warning-list" role="status">{paymentWarnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>}
          {submitError && <p className="error-message" role="alert">{t(submitError)}</p>}
          <div className="modal-actions">
            <button className="button" type="button" disabled={mutation.isPending} onClick={() => { setPaymentModalOpen(false); setPaymentPin(''); setPaymentValidationError(''); }}>{t('Annuler')}</button>
            <button className="button primary" type="button" disabled={!requestFormIsValid || paymentWarnings.length > 0 || mutation.isPending} onClick={confirmSimulatedPayment}>{t(mutation.isPending ? 'Confirmation...' : requestFee > 0 ? 'Valider le paiement' : 'Confirmer l’envoi')}</button>
          </div>
        </section></div>}

      {editingRequest && <div className="modal-backdrop" role="presentation">
        <section className="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="edit-request-title" style={{ width: 'min(760px, 100%)', maxHeight: '90vh', overflowY: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 12 }}>
            <div><p className="eyebrow">{t('Correction du dossier')}</p><h2 id="edit-request-title">{t('Vérifier et modifier ma demande')}</h2><p>{t('Vous pouvez corriger les informations et ajouter une pièce tant que la demande n’a pas été traitée.')}</p></div>
            <button className="button muted small" type="button" aria-label={t('Fermer')} onClick={() => setEditingRequest(null)}><X size={16} /></button>
          </div>
          {loadingEditRequirements ? <p>{t('Chargement...')}</p> : (
            <div className="request-form">
              <label className="request-field">{t('Objet')}<input value={editTitle} onChange={(event) => setEditTitle(event.target.value)} /></label>
              <section className="request-form-section"><h3>{t('Informations demandées')}</h3><div className="request-form-grid">
                {(editRequirements?.fields ?? []).map((field) => (
                  <label className={`request-field ${field.type === 'textarea' ? 'full-width' : ''}`} key={field.name}>
                    {t(field.label)}{field.required ? ' *' : ''}
                    {field.type === 'textarea' ? <textarea rows={3} required={field.required} value={editFormData[field.name] ?? ''} onChange={(event) => setEditFormData((previous) => ({ ...previous, [field.name]: event.target.value }))} /> : <input type={field.type} required={field.required} value={editFormData[field.name] ?? ''} onChange={(event) => setEditFormData((previous) => ({ ...previous, [field.name]: event.target.value }))} />}
                  </label>
                ))}
              </div></section>
              <label className="request-field">{t('Description complémentaire')}<textarea rows={3} value={editDescription} onChange={(event) => setEditDescription(event.target.value)} /></label>
              <section className="request-form-section"><h3>{t('Pièces justificatives')}</h3>
                {editingRequest.attachments?.length ? <div style={{ display: 'grid', gap: 8 }}>
                  {editingRequest.attachments.map((attachment) => <div key={attachment.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                    <span>{t(attachment.label ?? 'Pièce complémentaire')} — {attachment.originalName}</span>
                    <button className="button muted small" type="button" onClick={() => void downloadRequestAttachment(editingRequest.id, attachment.id, attachment.originalName)}><Download size={14} />{t('Télécharger')}</button>
                  </div>)}
                </div> : <p>{t('Aucune pièce jointe pour le moment.')}</p>}
                <div className="request-form-grid">
                  <label className="request-field">{t('Pièce à modifier')}<select value={editAttachmentId} onChange={(event) => {
                    const nextId = event.target.value;
                    setEditAttachmentId(nextId);
                    setEditAttachmentLabel('');
                    setEditAttachmentFile(null);
                  }}>
                    <option value="">{t('Ajouter une nouvelle pièce')}</option>
                    {(editingRequest.attachments ?? []).map((item) => <option key={item.id} value={item.id}>{t(item.label ?? 'Pièce complémentaire')} — {item.originalName}</option>)}
                  </select></label>
                  {editAttachmentId ? <label className="request-field">{t('Nouveau fichier')}<input type="file" accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png" onChange={(event) => setEditAttachmentFile(event.target.files?.[0] ?? null)} /></label> : <>
                    <label className="request-field">{t('Type de pièce')}<select value={editAttachmentLabel} onChange={(event) => setEditAttachmentLabel(event.target.value)}>
                      <option value="">{t('Choisir une pièce')}</option>
                      {(editRequirements?.attachments ?? []).map((item) => <option key={item.key} value={item.label}>{t(item.label)}</option>)}
                    </select></label>
                    <label className="request-field">{t('Ajouter une pièce')}<input type="file" accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png" onChange={(event) => setEditAttachmentFile(event.target.files?.[0] ?? null)} /></label>
                  </>}
                </div>
                {editAttachmentFile && <small>{editAttachmentFile.name} ({Math.ceil(editAttachmentFile.size / 1024)} Ko)</small>}
                <small className="form-hint">{t('Un remplacement conserve le type de pièce et met à jour le fichier joint au dossier.')}</small>
              </section>
              {editError && <p className="error-message" role="alert">{t(editError)}</p>}
              <div className="modal-actions">
                <button className="button" type="button" disabled={editMutation.isPending} onClick={() => setEditingRequest(null)}>{t('Annuler')}</button>
                <button className="button primary" type="button" disabled={editMutation.isPending || loadingEditRequirements || Boolean(editAttachmentFile && !editAttachmentId && !editAttachmentLabel)} onClick={() => editMutation.mutate()}><Save size={15} />{t(editMutation.isPending ? 'Enregistrement...' : 'Enregistrer les modifications')}</button>
              </div>
            </div>
          )}
        </section>
      </div>}

      <div className="panel" style={{ padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <h3>{t('Mes demandes')}</h3>
          <button className="button small" onClick={() => void refetchRequests()} disabled={refreshingRequests} aria-label={t('Actualiser mes demandes')}><RefreshCw size={15} /> {t('Actualiser')}</button>
        </div>
        {requestError && <p className="error-message" role="alert">{t(requestError)}</p>}
        {isLoading ? <p>{t('Chargement...')}</p> : (
          <div style={{ display: 'grid', gap: 10 }}>
            {requests.length === 0 ? <p>{t('Aucune demande pour le moment.')}</p> : visibleRequests.map((request) => (
              <div key={request.id} style={{ border: '1px solid #dfe7ef', borderRadius: 12, padding: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                  <strong>{request.title ?? request.type}</strong>
                  <span className={`status ${statusClassNames[request.status] ?? 'en_traitement'}`}>
                    {t(formatStatus(request.status))}
                  </span>
                </div>
                <small style={{ display: 'block', marginTop: 6 }}>{language === 'mg' ? request.service?.nameMg ?? t(request.type) : request.service?.nameFr ?? t(request.type)}</small>
                {request.history && request.history.length > 0 && <small style={{ display: 'block', marginTop: 8, color: '#54657a' }}>
                  {t('Dernière mise à jour')} : {t(request.history[request.history.length - 1].comment ?? formatStatus(request.history[request.history.length - 1].status))}
                </small>}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                  <button className="button muted small" type="button" onClick={() => setExpandedRequestId(expandedRequestId === request.id ? null : request.id)}><Eye size={14} />{t(expandedRequestId === request.id ? 'Masquer le dossier' : 'Vérifier le dossier')}</button>
                  {citizenCanEdit(request.status) && <button className="button small" type="button" onClick={() => beginEditingRequest(request)}><Pencil size={14} />{t('Modifier')}</button>}
                </div>
                {expandedRequestId === request.id && <div className="request-form-section" style={{ marginTop: 12 }}>
                  <h3>{t('Informations déclarées')}</h3>
                  {request.formData && Object.keys(request.formData).length > 0 ? <div style={{ display: 'grid', gap: 6 }}>
                    {Object.entries(request.formData).map(([key, value]) => <small key={key}><strong>{t(displayRequirements?.fields.find((field) => field.name === key)?.label ?? key)} :</strong> {renderValue(value)}</small>)}
                  </div> : <small>{t('Aucune information de formulaire.')}</small>}
                  {request.description && <p><strong>{t('Description complémentaire')} :</strong> {request.description}</p>}
                  <h3>{t('Pièces justificatives')}</h3>
                  {request.attachments?.length ? request.attachments.map((attachment) => <button key={attachment.id} className="button muted small" type="button" onClick={() => void downloadRequestAttachment(request.id, attachment.id, attachment.originalName)}><Download size={14} />{t(attachment.label ?? 'Pièce complémentaire')} — {attachment.originalName}</button>) : <small>{t('Aucune pièce jointe pour le moment.')}</small>}
                </div>}
              </div>
            ))}
            <Pagination page={requestPage} totalPages={Math.max(1, Math.ceil(requests.length / 5))} onChange={setRequestPage} />
          </div>
        )}
      </div>
    </div>
  );
}
