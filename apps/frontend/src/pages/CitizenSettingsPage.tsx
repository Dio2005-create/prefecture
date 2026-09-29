import { FormEvent, useState } from 'react';
import { Eye, EyeOff, KeyRound } from 'lucide-react';
import axios from 'axios';
import { useAuth } from '../auth';
import { authService } from '../services/api';

function PasswordInput({ value, onChange, label, autoComplete }: { value: string; onChange: (value: string) => void; label: string; autoComplete: string }) {
  const [visible, setVisible] = useState(false);
  return <label className="request-field"><span>{label}</span><span className="password-field"><input type={visible ? 'text' : 'password'} value={value} onChange={(event) => onChange(event.target.value)} autoComplete={autoComplete} required minLength={8} /><button type="button" className="password-toggle" onClick={() => setVisible((current) => !current)} aria-label={visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}>{visible ? <EyeOff size={18} /> : <Eye size={18} />}</button></span></label>;
}

export function CitizenSettingsPage() {
  const { logout } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const showToast = (type: 'success' | 'error', text: string) => { setToast({ type, text }); window.setTimeout(() => setToast(null), 5000); };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setMessage('');
    if (newPassword.length < 8) { setError('Le nouveau mot de passe doit contenir au moins 8 caractères.'); return; }
    if (newPassword !== confirmation) { setError('La confirmation ne correspond pas au nouveau mot de passe.'); return; }
    setSaving(true);
    try {
      const result = await authService.changePassword(currentPassword, newPassword);
      setMessage(result.message);
      showToast('success', 'Mot de passe modifié avec succès.');
      window.setTimeout(() => void logout(), 1200);
    } catch (requestError) {
      const responseMessage = axios.isAxiosError(requestError) ? (requestError.response?.data as { message?: string } | undefined)?.message : undefined;
      const text = responseMessage ?? 'Impossible de modifier le mot de passe.';
      setError(text);
      showToast('error', text);
    } finally {
      setSaving(false);
    }
  };

  return <section className="settings-page"><div className="panel settings-panel"><p className="eyebrow">Mon compte</p><h1>Paramètres</h1><p>Modifiez le mot de passe utilisé pour accéder à votre espace citoyen.</p><form className="settings-form" onSubmit={submit}><div className="settings-heading"><span className="settings-icon"><KeyRound size={20} /></span><div><h2>Changer le mot de passe</h2><small>Utilisez au moins 8 caractères.</small></div></div><PasswordInput label="Mot de passe actuel" value={currentPassword} onChange={setCurrentPassword} autoComplete="current-password" /><PasswordInput label="Nouveau mot de passe" value={newPassword} onChange={setNewPassword} autoComplete="new-password" /><PasswordInput label="Confirmer le nouveau mot de passe" value={confirmation} onChange={setConfirmation} autoComplete="new-password" />{error && <p className="error-message" role="alert">{error}</p>}{message && <p className="success-message" role="status">{message}</p>}<button className="button primary" type="submit" disabled={saving}>{saving ? 'Modification...' : 'Modifier le mot de passe'}</button></form></div>{toast && <div className={`toast toast-${toast.type}`} role="status"><span>{toast.text}</span></div>}</section>;
}
