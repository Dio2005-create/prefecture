import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, RefreshCw, Eye } from 'lucide-react';
import { prefectureService } from '../services/api';
import { Pagination } from '../components/ui';
import type { RequestAttachmentRequirement, RequestType, RequestRequirements } from '../types';

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
  GOOD_CHARACTER_CERTIFICATE: 'Certificat de bonne vie et moeurs',
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
  const [requestPage, setRequestPage] = useState(1);
  const visibleRequests = requests.slice((requestPage - 1) * 5, requestPage * 5);
  const formFields = dynamicRequirements?.fields ?? [];
  const requiredAttachments = dynamicRequirements?.attachments ?? [];
  const requestFee = Number(fees[requestType] ?? 0);

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
    },
    onError: (error) => setSubmitError(error instanceof Error ? error.message : 'La demande n’a pas pu être envoyée.'),
  });

  const downloadApprovedRequest = async (requestId: string) => {
    try {
      const blob = await prefectureService.downloadPdf(requestId);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `demande-${requestId}.pdf`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : 'Le document ne peut pas être téléchargé.');
    }
  };

  const downloadRequestModel = async () => {
    try {
      const blob = await prefectureService.downloadModelPdf(requestType);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `modele-${requestType.toLowerCase()}.pdf`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : 'Le modèle PDF ne peut pas être téléchargé.');
    }
  };

  const confirmSimulatedPayment = () => {
    if (loadingFees || feesError || !Number.isFinite(requestFee)) {
      setPaymentValidationError('Le tarif configuré est indisponible. Réessayez après actualisation.');
      return;
    }
    if (requestFee > 0 && (!/^\d{10}$/.test(paymentPhone) || !mobileMoneyPrefixes[paymentProvider].some((prefix) => paymentPhone.startsWith(prefix)))) {
      setPaymentValidationError(`Saisissez 10 chiffres avec un préfixe valide pour ${paymentProvider === 'MVOLA' ? 'MVola (034, 038, 036)' : paymentProvider === 'AIRTEL_MONEY' ? 'Airtel Money (033, 035)' : 'Orange Money (032, 037)'}.`);
      return;
    }
    if (requestFee > 0 && paymentPin !== '1234') {
      setPaymentValidationError('Code PIN incorrect. Utilisez le code de démonstration 1234.');
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
    if (loadingFees || feesError || !Number.isFinite(requestFee)) {
      setSubmitError('Impossible de charger le tarif configuré. Réessayez avant de soumettre.');
      return;
    }
    const errors: Record<string, string> = {};
    formFields.forEach((field) => {
      const value = formData[field.name]?.trim() ?? '';
      if (field.required && !value) errors[field.name] = 'Ce champ est obligatoire.';
      if (value && field.name.toLowerCase().includes('cin') && field.name !== 'cinNif' && !/^\d{12}$/.test(value)) errors[field.name] = 'La CIN doit contenir exactement 12 chiffres.';
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
    const missingAttachments = requiredAttachments.filter((requirement) => requirement.required && selectedFiles.filter((item) => item.requirement === requirement.label).length < (requirement.minFiles ?? 1));
    if (missingAttachments.length > 0) {
      setSubmitError(`Pièces obligatoires manquantes : ${missingAttachments.map((item) => item.label).join(', ')}`);
      return;
    }
    setSubmitError('');
    setPaymentModalOpen(true);
  };

  return (
    <div className="request-page">
      <div className="panel request-form-panel">
        <div className="request-form-header"><div><p className="eyebrow">Démarche en ligne</p><h2>Nouvelle demande</h2><p>Renseignez les informations nécessaires à l’instruction de votre dossier.</p></div><span className="request-form-badge">Formulaire sécurisé</span></div>
        <div className="request-form">
          <section className="request-form-section"><h3>Choisir la démarche</h3><div className="request-form-grid">
          <label className="request-field">
            Service
            <select value={selectedServiceId} onChange={(e) => {
              const nextServiceId = e.target.value;
              const service = services.find((item) => item.id === nextServiceId);
              setSelectedServiceId(nextServiceId);
              if (service && requestTypeByServiceCode[service.code]) handleTypeChange(requestTypeByServiceCode[service.code]);
            }}>
              <option value="">Choisir un service</option>
              {services.map((service) => (
                <option key={service.id} value={service.id}>{service.nameFr}</option>
              ))}
            </select>
          </label>

          <label className="request-field">
            Type de démarche
            <select value={requestType} onChange={(e) => handleTypeChange(e.target.value as RequestType)}>
              {Object.entries(requestLabels).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label></div></section>

          <section className="request-form-section"><h3>Objet du dossier</h3><label className="request-field">
            Objet
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={requestLabels[requestType]} />
          </label></section>

          <section className="request-form-section"><div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}><h3>Informations demandées</h3><button className="button small" type="button" onClick={() => void downloadRequestModel()}><Download size={14} /> Modèle PDF</button></div><div className="request-form-grid">
            {formFields.map((field) => (
              <label className={`request-field ${field.type === 'textarea' ? 'full-width' : ''}`} key={field.name}>
                {field.label}
                {field.type === 'textarea' ? (
                  <textarea
                    required={field.required}
                    value={formData[field.name] ?? ''}
                    onChange={(e) => { setFormData((prev) => ({ ...prev, [field.name]: e.target.value })); setFieldErrors((prev) => ({ ...prev, [field.name]: '' })); }}
                    rows={3}
                    placeholder={field.label}
                  />
                ) : (
                  <input
                    type={field.type}
                    required={field.required}
                    value={formData[field.name] ?? ''}
                    onChange={(e) => { setFormData((prev) => ({ ...prev, [field.name]: e.target.value })); setFieldErrors((prev) => ({ ...prev, [field.name]: '' })); }}
                    placeholder={field.label}
                  />
                )}
                {fieldErrors[field.name] && <small className="field-warning" role="alert">{fieldErrors[field.name]}</small>}
              </label>
            ))}
          </div></section>

          <section className="request-form-section"><h3>Pièces justificatives</h3><p className="form-hint">Formats acceptés : PDF, JPG et PNG. Les pièces marquées d’un astérisque sont obligatoires ; les autres sont facultatives.</p>{requirementsError && <p className="error-message" role="alert">Impossible de charger les pièces exigées. Actualisez la page avant de soumettre.</p>}<div className="request-form-grid">
            {requiredAttachments.map((requirement) => {
              const files = selectedFiles.filter((item) => item.requirement === requirement.label);
              return <div className="request-field full-width" key={requirement.key}>
                <label>{requirement.label}{requirement.required ? ' *' : ' (facultatif)'}
                  <input type="file" accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png" multiple={requirement.multiple} required={requirement.required && files.length < (requirement.minFiles ?? 1)} onChange={(event) => handleFiles(requirement, event.target.files)} />
                </label>
                {files.length > 0 && <div className="file-preview">{files.map((item) => <span key={`${requirement.key}-${item.file.name}`} style={{ display: 'flex', alignItems: 'center', gap: 8 }}><small>{item.file.name} ({Math.ceil(item.file.size / 1024)} Ko)</small><button type="button" className="button small" onClick={() => previewFile(item.file)}><Eye size={13} /> Aperçu</button></span>)}</div>}
              </div>;
            })}
          </div></section>

          <section className="request-form-section"><h3>Informations complémentaires</h3><label className="request-field full-width">
            Description complémentaire
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} placeholder="Décrivez votre demande ou précisez les informations utiles" />
          </label></section>

          {submitError && <p className="error-message" role="alert">{submitError}</p>}
          {requestError && <p className="error-message" role="alert">{requestError}</p>}
          <button
            className="button primary request-submit"
            disabled={!selectedServiceId || mutation.isPending || loadingRequirements || requirementsError}
            onClick={submitRequest}
          >
            {mutation.isPending ? 'Envoi...' : 'Soumettre la demande'}
          </button>
        </div>
      </div>

        {paymentModalOpen && <div className="modal-backdrop payment-backdrop" role="presentation"><section className="confirm-modal payment-modal" role="dialog" aria-modal="true" aria-labelledby="payment-title" aria-describedby="payment-description">
          <p className="eyebrow">Étape de paiement</p>
          <h2 id="payment-title">Confirmer le paiement</h2>
          <p id="payment-description">{requestLabels[requestType]} · {requestFee.toLocaleString('fr-FR')} Ar</p>
          <p className="payment-demo-notice">Mode démonstration : aucun débit réel n’est effectué. PIN de test : 1234. Le dossier est transmis après validation.</p>
          {requestFee > 0 && <div className="payment-fields">
            <label className="request-field">Opérateur<select value={paymentProvider} onChange={(event) => { setPaymentProvider(event.target.value as MobileMoneyProvider); setPaymentPhone(''); setPaymentPin(''); setPaymentValidationError(''); }}><option value="MVOLA">MVola</option><option value="AIRTEL_MONEY">Airtel Money</option><option value="ORANGE_MONEY">Orange Money</option></select></label>
            <label className="request-field">Numéro du citoyen (10 chiffres)<input type="tel" inputMode="numeric" autoComplete="tel-national" value={paymentPhone} maxLength={10} placeholder={paymentProvider === 'MVOLA' ? '0340000000' : paymentProvider === 'AIRTEL_MONEY' ? '0330000000' : '0320000000'} onChange={(event) => { setPaymentPhone(event.target.value.replace(/\D/g, '').slice(0, 10)); setPaymentValidationError(''); }} /></label>
            <label className="request-field">Code PIN de simulation (4 chiffres)<input type="password" inputMode="numeric" autoComplete="one-time-code" value={paymentPin} maxLength={4} onChange={(event) => { setPaymentPin(event.target.value.replace(/\D/g, '').slice(0, 4)); setPaymentValidationError(''); }} /></label>
            <small className="form-hint">Préfixes autorisés : {paymentProvider === 'MVOLA' ? '034, 038 ou 036' : paymentProvider === 'AIRTEL_MONEY' ? '033 ou 035' : '032 ou 037'}.</small>
          </div>}
          {paymentValidationError && <p className="error-message" role="alert">{paymentValidationError}</p>}
          {submitError && <p className="error-message" role="alert">{submitError}</p>}
          <div className="modal-actions">
            <button className="button" type="button" disabled={mutation.isPending} onClick={() => { setPaymentModalOpen(false); setPaymentPin(''); setPaymentValidationError(''); }}>Annuler</button>
            <button className="button primary" type="button" disabled={mutation.isPending || loadingFees || feesError || (requestFee > 0 && (!/^\d{10}$/.test(paymentPhone) || !mobileMoneyPrefixes[paymentProvider].some((prefix) => paymentPhone.startsWith(prefix)) || !/^\d{4}$/.test(paymentPin) || paymentPin !== '1234'))} onClick={confirmSimulatedPayment}>{mutation.isPending ? 'Confirmation...' : requestFee > 0 ? 'Valider le paiement' : 'Confirmer l’envoi'}</button>
          </div>
        </section></div>}

      <div className="panel" style={{ padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <h3>Mes demandes</h3>
          <button className="button small" onClick={() => void refetchRequests()} disabled={refreshingRequests} aria-label="Actualiser mes demandes"><RefreshCw size={15} /> Actualiser</button>
        </div>
        {requestError && <p className="error-message" role="alert">{requestError}</p>}
        {isLoading ? <p>Chargement...</p> : (
          <div style={{ display: 'grid', gap: 10 }}>
            {requests.length === 0 ? <p>Aucune demande pour le moment.</p> : visibleRequests.map((request) => (
              <div key={request.id} style={{ border: '1px solid #dfe7ef', borderRadius: 12, padding: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                  <strong>{request.title ?? request.type}</strong>
                  <span className={`status ${statusClassNames[request.status] ?? 'en_traitement'}`}>
                    {formatStatus(request.status)}
                  </span>
                </div>
                <small style={{ display: 'block', marginTop: 6 }}>{request.service?.nameFr ?? request.type}</small>
                {request.formData && Object.keys(request.formData).length > 0 && (
                  <small style={{ display: 'block', marginTop: 8, color: '#54657a' }}>
                    {Object.entries(request.formData).slice(0, 3).map(([key, value]) => `${key}: ${renderValue(value)}`).join(' • ')}
                  </small>
                )}
                {request.history && request.history.length > 0 && <small style={{ display: 'block', marginTop: 8, color: '#54657a' }}>
                  Dernière mise à jour : {request.history[request.history.length - 1].comment ?? formatStatus(request.history[request.history.length - 1].status)}
                </small>}
                {request.status === 'APPROVED' && <button className="button small" style={{ marginTop: 10 }} onClick={() => void downloadApprovedRequest(request.id)}><Download size={15} /> Télécharger le document</button>}
              </div>
            ))}
            <Pagination page={requestPage} totalPages={Math.max(1, Math.ceil(requests.length / 5))} onChange={setRequestPage} />
          </div>
        )}
      </div>
    </div>
  );
}
