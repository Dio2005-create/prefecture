import { FormEvent, useState } from 'react';
import axios from 'axios';
import { Mail, Phone, UserRound } from 'lucide-react';
import { useAuth, type AuthUser } from '../auth';
import { authService } from '../services/api';

export function CitizenProfilePage() {
  const { user, updateUser } = useAuth();
  const profile = user as (AuthUser & { phone?: string | null; cin?: string | null }) | null;
  const [nom, setNom] = useState(profile?.nom ?? '');
  const [email, setEmail] = useState(profile?.email ?? '');
  const [phone, setPhone] = useState(profile?.phone ?? '');
  const [cin, setCin] = useState(profile?.cin ?? '');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const showToast = (type: 'success' | 'error', text: string) => { setToast({ type, text }); window.setTimeout(() => setToast(null), 5000); };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setMessage('');
    setError('');
    if (cin && !/^\d{12}$/.test(cin)) { setError('La CIN doit contenir exactement 12 chiffres.'); return; }
    setSaving(true);
    try {
      const result = await authService.updateProfile({ nom, email, phone, cin });
      updateUser(result.user as AuthUser);
      setMessage('Votre profil a été mis à jour.');
      showToast('success', 'Profil mis à jour avec succès.');
    } catch (requestError) {
      const responseMessage = axios.isAxiosError(requestError) ? (requestError.response?.data as { message?: string } | undefined)?.message : undefined;
      const text = responseMessage ?? 'Impossible de mettre à jour le profil.';
      setError(text);
      showToast('error', text);
    } finally {
      setSaving(false);
    }
  };

  return <section className="settings-page"><div className="panel settings-panel"><p className="eyebrow">Mon compte</p><h1>Modifier le profil</h1><p>Consultez et mettez à jour vos informations personnelles.</p><form className="settings-form" onSubmit={submit}><div className="profile-summary"><span className="settings-icon"><UserRound size={20} /></span><div><strong>{profile?.nom || 'Citoyen'}</strong><small>{profile?.role === 'CITIZEN' ? 'Compte citoyen' : 'Compte administrateur'}</small></div></div><label className="request-field">Nom complet<input value={nom} onChange={(event) => setNom(event.target.value)} autoComplete="name" /></label><label className="request-field"><span><Mail size={14} /> Adresse email</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required /></label><label className="request-field"><span><Phone size={14} /> Numéro de téléphone</span><input value={phone} onChange={(event) => setPhone(event.target.value)} autoComplete="tel" /></label><label className="request-field">CIN<input value={cin} onChange={(event) => setCin(event.target.value.replace(/\D/g, '').slice(0, 12))} inputMode="numeric" maxLength={12} placeholder="12 chiffres" /></label>{error && <p className="error-message" role="alert">{error}</p>}{message && <p className="success-message" role="status">{message}</p>}<button className="button primary" type="submit" disabled={saving}>{saving ? 'Enregistrement...' : 'Enregistrer le profil'}</button></form></div>{toast && <div className={`toast toast-${toast.type}`} role="status"><span>{toast.text}</span></div>}</section>;
}
