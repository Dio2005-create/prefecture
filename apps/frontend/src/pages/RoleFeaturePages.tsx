import { Bell, CalendarDays, FileText, ShieldCheck, Users, Download, Power, Trash2, Eye, X } from 'lucide-react';
import axios from 'axios';
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { adminService, appointmentService, documentService, notificationService, prefectureService, userService } from '../services/api';
import { Loading, Pagination, Toast, useToast } from '../components/ui';
import { useAuth } from '../auth';
import { usePreferences } from '../preferences';

export function CitizenDocumentsPage() {
  const { t, language } = usePreferences();
  const { data: requests = [], isLoading } = useQuery({ queryKey: ['citizen-requests'], queryFn: prefectureService.listRequests, refetchInterval: 3000 });
  const [downloadError, setDownloadError] = useState('');
  const approved = requests.filter((request: { status: string }) => request.status === 'APPROVED');
  const download = async (requestId: string) => {
    setDownloadError('');
    try {
      const blob = await prefectureService.downloadPdf(requestId);
      if (!blob.size) throw new Error('Le document reçu est vide.');
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `demande-${requestId}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.data instanceof Blob) {
        const message = await error.response.data.text();
        try {
          const payload = JSON.parse(message) as { message?: string };
          setDownloadError(payload.message ?? 'Le document ne peut pas être téléchargé.');
        } catch {
          setDownloadError('Le document ne peut pas être téléchargé.');
        }
      } else {
        setDownloadError('Le document ne peut pas être téléchargé.');
      }
    }
  };
  return <section className="panel" style={{ padding: 24 }}><p className="eyebrow">{t('Espace citoyen')}</p><h1>{t('Mes documents délivrés')}</h1><p>{t('Retrouvez ici les documents validés par la Préfecture d’Ihosy.')}</p>{downloadError && <p className="error-message">{t(downloadError)}</p>}{isLoading ? <p>{t('Chargement...')}</p> : approved.length === 0 ? <div className="empty-state"><FileText size={28} /><span>{t('Aucun document délivré pour le moment.')}</span></div> : <div style={{ display: 'grid', gap: 10 }}>{approved.map((request: { id: string; title?: string; service?: { nameFr: string; nameMg: string } }) => <div className="recent-row" key={request.id}><FileText size={18} /><span><strong>{request.title ?? (language === 'mg' ? request.service?.nameMg : request.service?.nameFr)}</strong><small>{t('PDF administratif disponible')}</small></span><button className="button small" onClick={() => void download(request.id)}>{t('Télécharger')}</button></div>)}</div>}</section>;
}

export function AssociationAndOngPage() {
  const { t } = usePreferences();
  const items = [
    { title: 'Déclaration d’association', detail: 'Dépôt, vérification des statuts et validation du dossier.', status: 'En instruction' },
    { title: 'Demande d’agrément', detail: 'Suivi des pièces justificatives et notification de décision.', status: 'Complément demandé' },
    { title: 'Manifestation / foire / quête', detail: 'Autorisation événementielle et coordination avec les services.', status: 'Validé' },
  ];

  return <section className="panel" style={{ padding: 24 }}>
    <p className="eyebrow">{t('Espace associations')}</p>
    <h1>{t('Associations / ONG')}</h1>
    <p>{t('Suivez vos dossiers associatifs, vos demandes d’agrément et vos autorisations d’événements.')}</p>
    <div style={{ display: 'grid', gap: 12, marginTop: 18 }}>
      {items.map((item) => (
        <article className="recent-row" key={item.title}>
          <FileText size={18} />
          <span>
            <strong>{t(item.title)}</strong>
            <small>{t(item.detail)}</small>
          </span>
          <span className="status en_traitement">{t(item.status)}</span>
        </article>
      ))}
    </div>
  </section>;
}

export function ComplaintPage() {
  const { t } = usePreferences();
  const items = [
    { title: 'Signalement d’un usage abusif', detail: 'Mise à jour envoyée au service compétent.', status: 'Reçu' },
    { title: 'Réclamation sur un délai', detail: 'Instruction en cours par la direction administrative.', status: 'En instruction' },
    { title: 'Demande de clarification', detail: 'Réponse attendue du service concerné.', status: 'Complément demandé' },
  ];

  return <section className="panel" style={{ padding: 24 }}>
    <p className="eyebrow">{t('Médiation citoyenne')}</p>
    <h1>{t('Signalement / réclamation')}</h1>
    <p>{t('Déposez un signalement, une réclamation ou une demande d’assistance administrative.')}</p>
    <div style={{ display: 'grid', gap: 12, marginTop: 18 }}>
      {items.map((item) => (
        <article className="recent-row" key={item.title}>
          <ShieldCheck size={18} />
          <span>
            <strong>{t(item.title)}</strong>
            <small>{t(item.detail)}</small>
          </span>
          <span className="status en_traitement">{t(item.status)}</span>
        </article>
      ))}
    </div>
  </section>;
}

export function OfficialInformationPage() {
  const { t, language } = usePreferences();
  const { data: documents = [], isLoading } = useQuery({ queryKey: ['public-documents'], queryFn: documentService.publicList });
  const download = (documentId: string, title: string, content?: string) => {
    const blob = new Blob([content ?? 'Contenu non disponible.'], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${title.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || documentId}.txt`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };
  return <section className="panel" style={{ padding: 24 }}><p className="eyebrow">{t('Information officielle')}</p><h1>{t('Textes, arrêtés et communiqués')}</h1><p>{t('Consultez les publications validées par la Préfecture.')}</p>{isLoading ? <p>{t('Chargement...')}</p> : documents.length === 0 ? <div className="empty-state"><FileText size={28} /><span>{t('Aucune publication disponible.')}</span></div> : <div style={{ display: 'grid', gap: 10 }}>{documents.map((document) => <article className="recent-row" key={document.id}><FileText size={18} /><span><strong>{document.titre}</strong><small>{t(document.type)} · {document.date ? new Date(document.date).toLocaleDateString(language === 'mg' ? 'mg-MG' : 'fr-FR') : t('Date non renseignée')}</small></span><button className="button small" onClick={() => download(document.id, document.titre, document.contenuTexte)}><Download size={14} />{t('Télécharger')}</button></article>)}</div>}</section>;
}

export function NotificationsPage() {
  const { t } = usePreferences();
  const client = useQueryClient();
  const [filter, setFilter] = useState<'ALL' | 'UNREAD' | 'READ'>('ALL');
  const [page, setPage] = useState(1);
  const { data: notifications = [], isLoading } = useQuery({ queryKey: ['notifications'], queryFn: notificationService.list });
  const filtered = notifications.filter((notification: { status: string }) => filter === 'ALL' || (filter === 'READ' ? notification.status === 'READ' : notification.status !== 'READ'));
  const visible = filtered.slice((page - 1) * 5, page * 5);
  const markRead = async (id: string) => { await notificationService.markAsRead(id); await client.invalidateQueries({ queryKey: ['notifications'] }); };
  return <section className="panel" style={{ padding: 24 }}><p className="eyebrow">{t('Information')}</p><h1>{t('Notifications')}</h1><p>{t('Les mises à jour de vos dossiers apparaîtront ici.')}</p><div className="notification-tabs">{[['ALL', 'Toutes'], ['UNREAD', 'Non lues'], ['READ', 'Lues']].map(([value, label]) => <button key={value} className={filter === value ? 'active' : ''} onClick={() => { setFilter(value as 'ALL' | 'UNREAD' | 'READ'); setPage(1); }}>{t(label)}</button>)}</div>{isLoading ? <p>{t('Chargement...')}</p> : visible.length === 0 ? <div className="empty-state"><Bell size={28} /><span>{t('Aucune notification.')}</span></div> : <div style={{ display: 'grid', gap: 10 }}>{visible.map((notification: { id: string; title: string; message: string; status: string; createdAt: string }) => <article key={notification.id} className="recent-row"><Bell size={18} /><span><strong>{t(notification.title)}</strong><small>{t(notification.message)}</small></span><button className="button small" disabled={notification.status === 'READ'} onClick={() => void markRead(notification.id)}>{t(notification.status === 'READ' ? 'Lue' : 'Marquer lue')}</button></article>)}</div>}<Pagination page={page} totalPages={Math.max(1, Math.ceil(filtered.length / 5))} onChange={setPage} /></section>;
}

export function UsersPage() {
  const { user } = useAuth();
  const { t } = usePreferences();
  const { toast, notify } = useToast();
  const { data: users = [], isLoading } = useQuery({ queryKey: ['users'], queryFn: userService.list });
  const client = useQueryClient();
  const [adminForm, setAdminForm] = useState({ email: '', password: '', nom: '', phone: '' });
  const [adminError, setAdminError] = useState('');
  const createAdmin = async () => { setAdminError(''); try { await adminService.createAdmin(adminForm); setAdminForm({ email: '', password: '', nom: '', phone: '' }); await client.invalidateQueries({ queryKey: ['users'] }); notify('success', t('Compte administrateur créé avec succès.')); } catch { const message = t('La création du compte administrateur a échoué.'); setAdminError(message); notify('error', message); } };
  const citizens = users.filter((user) => user.role === 'CITIZEN');
  const admins = users.filter((user) => user.role === 'ADMIN');
  const group = (title: string, entries: typeof users) => <section><h2>{t(title)}</h2><div style={{ display: 'grid', gap: 10 }}>{entries.length === 0 ? <p className="muted">{t('Aucun utilisateur.')}</p> : entries.map((user) => <div className="recent-row" key={user.id}><Users size={18} /><span><strong>{user.nom ?? user.email}</strong><small>{user.email} · {t(user.status)}</small></span></div>)}</div></section>;
  return <><section className="panel" style={{ padding: 24 }}><p className="eyebrow">{t('Administration')}</p><h1>{t('Utilisateurs')}</h1><p>{t('Les citoyens et les administrateurs sont gérés dans deux espaces distincts.')}</p>{user?.role === 'ADMIN' && <div className="admin-create-form"><h2>{t('Créer un administrateur')}</h2><small>{t('Cette action est réservée aux administrateurs.')}</small><input placeholder={t('Nom')} value={adminForm.nom} onChange={(event) => setAdminForm({ ...adminForm, nom: event.target.value })} /><input type="email" placeholder={t('Email')} value={adminForm.email} onChange={(event) => setAdminForm({ ...adminForm, email: event.target.value })} /><input placeholder={t('Téléphone')} value={adminForm.phone} onChange={(event) => setAdminForm({ ...adminForm, phone: event.target.value })} /><input type="password" placeholder={t('Mot de passe (8 caractères minimum)')} value={adminForm.password} onChange={(event) => setAdminForm({ ...adminForm, password: event.target.value })} /><button className="button primary" onClick={() => void createAdmin()} disabled={!adminForm.email || adminForm.password.length < 8}>{t('Créer le compte')}</button>{adminError && <p className="error-message">{adminError}</p>}</div>}{isLoading ? <p>{t('Chargement...')}</p> : <div style={{ display: 'grid', gap: 28 }}>{group('Administrateurs', admins)}{group('Citoyens', citizens)}</div>}<div style={{ marginTop: 20, display: 'flex', gap: 10, alignItems: 'center' }}><ShieldCheck size={18} /><strong>{t('Accès séparés par rôle')}</strong></div></section><Toast toast={toast} /></>;
}

export function AdminSettingsPage() {
  const { t } = usePreferences();
  const { toast, notify } = useToast();
  const { data: settings = [], isLoading } = useQuery({ queryKey: ['admin-settings'], queryFn: adminService.listSettings });
  const client = useQueryClient();
  const tariffs = [['BIRTH_CERTIFICATE', 'Acte de naissance', '5000'], ['RESIDENCE_CERTIFICATE', 'Certificat de résidence', '3000'], ['NATIONALITY_CERTIFICATE', 'Certificat de nationalité', '10000'], ['CIN_REQUEST', 'Demande de CIN', '2000'], ['CIN_RENEWAL', 'Renouvellement de CIN', '2000'], ['GOOD_CHARACTER_CERTIFICATE', 'Certificat de bonne vie et mœurs', '3000'], ['BUILDING_PERMIT', 'Permis de construire', '25000'], ['LAND_STATUS', 'Situation foncière', '10000'], ['COMMERCIAL_LICENSE', 'Licence commerciale', '15000'], ['VEHICLE_REGISTRATION', 'Immatriculation de véhicule', '10000'], ['LOSS_DECLARATION', 'Déclaration de perte', '2000'], ['SIGNATURE_LEGALIZATION', 'Légalisation de signature', '5000'], ['COMPLAINT', 'Signalement ou réclamation', '0'], ['SPECIAL_REQUEST', 'Demande particulière', '5000'], ['ASSOCIATION_DECLARATION', 'Déclaration d’association / ONG', '20000'], ['EVENT_AUTHORIZATION', 'Autorisation de manifestation', '15000'], ['ACCREDITATION', 'Demande d’agrément', '20000'], ['ADMINISTRATIVE_AUTHORIZATION', 'Autorisation administrative', '10000']] as const;
  const [values, setValues] = useState<Record<string, string>>({});
  useEffect(() => { setValues(Object.fromEntries(tariffs.map(([type, , fallback]) => [type, settings.find((item) => item.key === `fee.${type}`)?.value ?? fallback]))); }, [settings]);
  const save = async () => { try { await adminService.updateSettings(Object.fromEntries(Object.entries(values).map(([type, value]) => [`fee.${type}`, value]))); await client.invalidateQueries({ queryKey: ['admin-settings'] }); notify('success', t('Les tarifs ont été enregistrés.')); } catch { notify('error', t('Impossible d’enregistrer les tarifs.')); } };
  return <><section className="panel" style={{ padding: 24 }}><p className="eyebrow">{t('Configuration')}</p><h1>{t('Tarifs des 18 démarches')}</h1><p>{t('Configurez les tarifs de référence des démarches administratives.')}</p>{isLoading ? <Loading /> : <div className="admin-settings-form tariff-grid">{tariffs.map(([type, label]) => <label key={type}>{t(label)}<input type="number" min="0" value={values[type] ?? ''} onChange={(event) => setValues({ ...values, [type]: event.target.value })} /><small>Ar</small></label>)}<button className="button primary" onClick={() => void save()}>{t('Enregistrer les tarifs')}</button></div>}</section><Toast toast={toast} /></>;
}

export function AdminDocumentTemplatesPage() {
  const { t } = usePreferences();
  const { toast, notify } = useToast();
  const client = useQueryClient();
  const { data: templates = [], isLoading } = useQuery({ queryKey: ['admin-templates'], queryFn: adminService.listTemplates });
  const [requestType, setRequestType] = useState('RESIDENCE_CERTIFICATE');
  const [name, setName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [search, setSearch] = useState('');
  const [preview, setPreview] = useState<typeof templates[number] | null>(null);
  const save = async () => {
    if (!name.trim() || !file) return;
    try { await adminService.saveTemplate(file, { requestType, name: name.trim() }); setName(''); setFile(null); await client.invalidateQueries({ queryKey: ['admin-templates'] }); notify('success', t('Modèle enregistré et activé.')); } catch { notify('error', t('Impossible d’enregistrer le modèle.')); }
  };
  const requestTypeLabels: Record<string, string> = {
    BIRTH_CERTIFICATE: 'Acte de naissance', RESIDENCE_CERTIFICATE: 'Certificat de résidence', NATIONALITY_CERTIFICATE: 'Certificat de nationalité', CIN_REQUEST: 'Demande de CIN', CIN_RENEWAL: 'Renouvellement de CIN',
    GOOD_CHARACTER_CERTIFICATE: 'Certificat de bonne vie et mœurs', BUILDING_PERMIT: 'Permis de construire', LAND_STATUS: 'Situation foncière', COMMERCIAL_LICENSE: 'Licence commerciale', VEHICLE_REGISTRATION: 'Immatriculation véhicule', LOSS_DECLARATION: 'Déclaration de perte', SIGNATURE_LEGALIZATION: 'Légalisation de signature', COMPLAINT: 'Signalement ou réclamation', SPECIAL_REQUEST: 'Demande particulière',
    ASSOCIATION_DECLARATION: 'Déclaration d’association / ONG', EVENT_AUTHORIZATION: 'Autorisation de manifestation / foire / quête', ACCREDITATION: 'Demande d’agrément', ADMINISTRATIVE_AUTHORIZATION: 'Autre autorisation administrative',
  };
  return <><section className="panel" style={{ padding: 24 }}>
    <p className="eyebrow">{t('Modèles administratifs')}</p>
    <p>{t('Associez un fichier PDF de référence au type de démarche correspondant.')}</p>
    <div style={{ display: 'grid', gap: 10, marginTop: 18, padding: 14, border: '1px solid var(--color-border)', borderRadius: 8 }}>
      <select value={requestType} onChange={(event) => setRequestType(event.target.value)} style={{ padding: 10 }}>
        {Object.entries(requestTypeLabels).map(([type, label]) => <option key={type} value={type}>{t(label)}</option>)}
      </select>
      <input value={name} onChange={(event) => setName(event.target.value)} placeholder={t('Nom du modèle')} style={{ padding: 10 }} />
      <label className="request-field">{t('Fichier modèle PDF')}<input type="file" accept="application/pdf,.pdf" aria-label={t('Fichier modèle PDF')} onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></label>
      <button className="button primary" onClick={() => void save()} disabled={!name.trim() || !file}>{t('Enregistrer le modèle')}</button>
    </div>
    <div style={{ display: 'grid', gap: 12, marginTop: 18 }}>
      <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('Rechercher un modèle par son nom')} style={{ padding: 10 }} />
      {isLoading ? <p>{t('Chargement...')}</p> : templates.filter((template) => template.name.toLowerCase().includes(search.toLowerCase())).map((template) => (
        <article className="recent-row" key={template.id}>
          <FileText size={18} />
          <span>
            <strong>{t(template.requestType)}</strong>
            <small>{template.name} · {template.originalName ?? t('Fichier modèle')}</small>
          </span>
          <span className={`status ${template.isActive ? 'valide' : 'erreur'}`}>{t(template.isActive ? 'Actif' : 'Inactif')}</span>
          <div className="mark-actions"><button className="button muted" onClick={() => void (template.isActive ? adminService.deactivateTemplate(template.id) : adminService.activateTemplate(template.id)).then(() => client.invalidateQueries({ queryKey: ['admin-templates'] }))}><Power size={13} />{t(template.isActive ? 'Désactiver' : 'Activer')}</button><button className="button" onClick={() => setPreview(template)}><Eye size={13} />{t('Visualiser')}</button><button className="button danger" onClick={() => void adminService.deleteTemplate(template.id).then(() => client.invalidateQueries({ queryKey: ['admin-templates'] }))}><Trash2 size={13} />{t('Supprimer')}</button></div>
        </article>
      ))}
    </div>
    {preview && <div className="modal-backdrop" role="presentation"><section className="confirm-modal template-preview-modal" role="dialog" aria-modal="true"><button className="icon-button modal-close" onClick={() => setPreview(null)} aria-label={t('Fermer')}><X size={17} /></button><p className="eyebrow">{t('Aperçu du modèle')}</p><h2>{preview.name}</h2><p>{t('Type de démarche')} : {t(requestTypeLabels[preview.requestType] ?? preview.requestType)}</p><div className="template-preview-sheet"><FileText size={34} /><strong>{preview.originalName ?? t('Fichier modèle')}</strong><small>{preview.mimeType ?? t('Format non renseigné')}</small>{preview.bodyText && <pre style={{ whiteSpace: 'pre-wrap', font: 'inherit', textAlign: 'left' }}>{preview.bodyText}</pre>}</div></section></div>}
  </section><Toast toast={toast} /></>;
}

export function AdminStampAndSignaturePage() {
  const { t, language } = usePreferences();
  const { toast, notify } = useToast();
  const client = useQueryClient();
  const { data: marks = [], isLoading } = useQuery({ queryKey: ['admin-marks'], queryFn: adminService.listMarks });
  const [name, setName] = useState('');
  const [kind, setKind] = useState('STAMP');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const upload = async () => {
    if (!name.trim() || !file) return;
    setUploading(true);
    try {
      await adminService.uploadMark(file, { name: name.trim(), kind });
      setName(''); setFile(null); await client.invalidateQueries({ queryKey: ['admin-marks'] });
      notify('success', t('Élément officiel importé.'));
    } catch {
      notify('error', t('Impossible d’importer cet élément officiel.'));
    } finally {
      setUploading(false);
    }
  };
  const toggleMark = async (id: string, isActive: boolean) => {
    try { if (isActive) await adminService.deactivateMark(id); else await adminService.activateMark(id); await client.invalidateQueries({ queryKey: ['admin-marks'] }); notify('success', t(isActive ? 'Élément désactivé.' : 'Élément activé.')); } catch { notify('error', t('Impossible de modifier cet élément.')); }
  };
  const removeMark = async (id: string) => {
    try { await adminService.deleteMark(id); setDeleteTarget(null); await client.invalidateQueries({ queryKey: ['admin-marks'] }); notify('success', t('Élément supprimé.')); } catch { notify('error', t('Impossible de supprimer cet élément.')); }
  };
  return <><section className="panel" style={{ padding: 24 }}>
    <p className="eyebrow">{t('Signature & cachet')}</p>
    <h1>{t('Cachets et signatures')}</h1>
    <p>{t('Les éléments actifs sont appliqués automatiquement aux PDF délivrés.')}</p>
    <div style={{ display: 'grid', gap: 10, marginTop: 18, padding: 14, border: '1px solid var(--color-border)', borderRadius: 8 }}>
      <input value={name} onChange={(event) => setName(event.target.value)} placeholder={t('Nom du cachet ou de la signature')} style={{ padding: 10 }} />
      <select value={kind} onChange={(event) => setKind(event.target.value)} style={{ padding: 10 }}><option value="STAMP">{t('Cachet')}</option><option value="SIGNATURE">{t('Signature')}</option></select>
      <input type="file" accept="image/png,image/jpeg,.png,.jpg,.jpeg" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
      {file && <small>{file.name}</small>}
      <button className="button primary" onClick={() => void upload()} disabled={!name.trim() || !file || uploading}>{t(uploading ? 'Importation...' : 'Importer le fichier')}</button>
    </div>
    <div style={{ display: 'grid', gap: 12, marginTop: 18 }}>
      {isLoading ? <p>{t('Chargement...')}</p> : marks.map((mark) => (
        <article className="recent-row" key={mark.id}>
          <ShieldCheck size={18} />
          <span>
            <strong>{mark.name}</strong>
            <small>{t(mark.kind === 'STAMP' ? 'Cachet' : 'Signature')} · {mark.mimeType ?? 'image'}</small>
          </span>
          <span className={`status ${mark.isActive ? 'valide' : 'erreur'}`}>{t(mark.isActive ? 'Actif' : 'Inactif')}</span>
          <div className="mark-actions">
            <button className="button muted" onClick={() => void toggleMark(mark.id, mark.isActive)}><Power size={13} />{t(mark.isActive ? 'Désactiver' : 'Activer')}</button>
            <button className="button danger" onClick={() => setDeleteTarget(mark.id)}><Trash2 size={13} />{t('Supprimer')}</button>
          </div>
        </article>
      ))}
    </div>
    {deleteTarget && <div className="modal-backdrop" role="presentation"><section className="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="delete-mark-title"><p className="eyebrow">{t('Signature & cachet')}</p><h2 id="delete-mark-title">{t('Supprimer cet élément ?')}</h2><p>{t('Cette action retirera définitivement ce fichier officiel.')}</p><div className="modal-actions"><button className="button" onClick={() => setDeleteTarget(null)}>{t('Annuler')}</button><button className="button danger" onClick={() => void removeMark(deleteTarget)}>{t('Supprimer')}</button></div></section></div>}
  </section><Toast toast={toast} /></>;
}

export function AdminAssociationPage() {
  const { t } = usePreferences();
  const dossiers = [
    { title: 'Association des jeunes acteurs', type: 'Déclaration', status: 'En instruction', date: '12 sept. 2026' },
    { title: 'ONG Solidarité rurale', type: 'Agrément', status: 'Complément demandé', date: '08 sept. 2026' },
    { title: 'Foire de la culture locale', type: 'Manifestation', status: 'Validé', date: '03 sept. 2026' },
  ];

  return <section className="panel" style={{ padding: 24 }}>
    <p className="eyebrow">{t('Back-office')}</p>
    <h1>{t('Associations, ONG et agréments')}</h1>
    <p>{t('Recueillir, instruire et valider les dossiers relatifs aux associations, ONG et autorisations événementielles.')}</p>
    <div style={{ display: 'grid', gap: 12, marginTop: 18 }}>
      {dossiers.map((dossier) => (
        <article className="recent-row" key={dossier.title}>
          <FileText size={18} />
          <span>
            <strong>{t(dossier.title)}</strong>
            <small>{t(dossier.type)} · {dossier.date}</small>
          </span>
          <span className="status en_traitement">{t(dossier.status)}</span>
        </article>
      ))}
    </div>
  </section>;
}

export function AdminPublicationsPage() {
  const { t, language } = usePreferences();
  const [selected, setSelected] = useState<{ title: string; date: string } | null>(null);
  const arrêtes = [
    { title: 'Arrêté n° 2026-041 – Autorisations d’événements', date: '14 sept. 2026' },
    { title: 'Communiqué – Mise à jour des procédures de dépôt', date: '09 sept. 2026' },
    { title: 'Instruction – Contrôle de légalité des actes', date: '03 sept. 2026' },
  ];

  return <section className="panel" style={{ padding: 24 }}>
    <p className="eyebrow">{t('Publications')}</p>
    <h1>{t('Arrêtés, communiqués et textes officiels')}</h1>
    <p>{t('Publication et traçabilité des arrêtés, directives et informations officielles.')}</p>
    <div style={{ display: 'grid', gap: 12, marginTop: 18 }}>
      {arrêtes.map((item) => (
        <article className="recent-row" key={item.title}>
          <FileText size={18} />
          <span>
            <strong>{item.title}</strong>
            <small>{item.date}</small>
          </span>
          <button className="button small" onClick={() => setSelected(item)}>{t('Consulter')}</button>
        </article>
      ))}
    </div>
    {selected && <div className="modal-backdrop" role="presentation"><section className="confirm-modal publication-modal" role="dialog" aria-modal="true" aria-labelledby="publication-title"><button className="icon-button modal-close" onClick={() => setSelected(null)} aria-label={t('Fermer')}><X size={17} /></button><p className="eyebrow">{t('Publication officielle')}</p><h2 id="publication-title">{t(selected.title)}</h2><p className="publication-date">{t('Publié le')} {selected.date}</p><div className="publication-preview"><FileText size={32} /><p>{t('Ce communiqué est disponible dans le fonds officiel de la Préfecture. Consultez son contenu avant de le télécharger ou de le transmettre.')}</p><button className="button primary" onClick={() => setSelected(null)}>{t('Fermer la consultation')}</button></div></section></div>}
  </section>;
}

export function AdminAppointmentsPage() {
  const { t, language } = usePreferences();
  const client = useQueryClient();
  const { data: appointments = [], isLoading } = useQuery({ queryKey: ['admin-appointments'], queryFn: appointmentService.listForAdmin, refetchInterval: 3000 });
  const update = async (id: string, status: 'BOOKED' | 'CANCELLED' | 'COMPLETED') => {
    await appointmentService.updateStatus(id, status);
    await client.invalidateQueries({ queryKey: ['admin-appointments'] });
  };
  return <section className="panel" style={{ padding: 24 }}><p className="eyebrow">{t('Accueil physique')}</p><h1>{t('Gestion des rendez-vous')}</h1><p>{t('Confirmez, refusez ou clôturez les rendez-vous pris par les citoyens.')}</p>{isLoading ? <p>{t('Chargement...')}</p> : appointments.length === 0 ? <div className="empty-state"><CalendarDays size={28} /><span>{t('Aucun rendez-vous enregistré.')}</span></div> : <div style={{ display: 'grid', gap: 10 }}>{appointments.map((appointment: { id: string; startsAt: string; office: string; status: string; user?: { nom?: string | null; email: string } }) => <div className="recent-row" key={appointment.id}><CalendarDays size={18} /><span><strong>{new Date(appointment.startsAt).toLocaleString(language === 'mg' ? 'mg-MG' : 'fr-FR')}</strong><small>{appointment.user?.nom ?? appointment.user?.email} · {t(appointment.office)} · {t(appointment.status)}</small></span>{appointment.status === 'PENDING' && <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}><button className="button small primary" onClick={() => void update(appointment.id, 'BOOKED')}>{t('Confirmer')}</button><button className="button small appointment-reject" onClick={() => void update(appointment.id, 'CANCELLED')}>{t('Refuser')}</button></span>}{appointment.status === 'BOOKED' && <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}><button className="button small appointment-reject" onClick={() => void update(appointment.id, 'CANCELLED')}>{t('Refuser')}</button><button className="button small appointment-complete" onClick={() => void update(appointment.id, 'COMPLETED')}>{t('Terminer')}</button></span>}</div>)}</div>}</section>;
}