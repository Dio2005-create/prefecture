import { FormEvent, useRef, useState, type ClipboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import axios from 'axios';
import { useAuth } from '../auth';
import { usePreferences } from '../preferences';
import { authService } from '../services/api';

export function LoginPage() {
  const [flow, setFlow] = useState<'login' | 'register' | 'forgot-email' | 'forgot-code'>('login');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const isRegistering = flow === 'register';
  const isForgotFlow = flow === 'forgot-email' || flow === 'forgot-code';
  const [nom, setNom] = useState('');
  const [phone, setPhone] = useState('');
  const [cin, setCin] = useState('');
  const [isAdult, setIsAdult] = useState<boolean | null>(null);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [resetEmail, setResetEmail] = useState('');
  const [otp, setOtp] = useState('      ');
  const [newPassword, setNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const otpInputs = useRef<Array<HTMLInputElement | null>>([]);
  const [reactivationReason, setReactivationReason] = useState('');
  const [reactivationRequested, setReactivationRequested] = useState(false);
  const { login, register } = useAuth();
  const { t } = usePreferences();
  const navigate = useNavigate();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setInfo('');
    if (flow === 'forgot-email') {
      try {
        const result = await authService.requestPasswordReset(resetEmail);
        setInfo(t(result.message));
        setFlow('forgot-code');
      } catch (requestError) {
        setError(getErrorMessage(requestError, 'Impossible d’envoyer le code de réinitialisation.'));
      }
      return;
    }
    if (flow === 'forgot-code') {
      try {
        const result = await authService.resetPassword({ email: resetEmail, code: otp.replace(/\s/g, ''), password: newPassword });
        setFlow('login');
        setIdentifier(resetEmail);
        setPassword('');
        setOtp('      ');
        setNewPassword('');
        setInfo(t(result.message));
      } catch (requestError) {
        setError(getErrorMessage(requestError, 'La réinitialisation du mot de passe a échoué.'));
      }
      return;
    }
    try {
      const user = isRegistering
        ? await register({ email: identifier, password, nom, phone: phone || undefined, cin: isAdult ? cin : undefined, isAdult: isAdult === true })
        : await login(identifier, password);
      if (user) {
        const defaultPath = user.roles.includes('CITIZEN') ? '/front/accueil' : '/back/accueil';
        navigate(defaultPath, { replace: true });
        return;
      }
      setError(t('Identifiant ou mot de passe incorrect.'));
    } catch (requestError) {
      const responseMessage = axios.isAxiosError(requestError)
        ? (requestError.response?.data as { message?: string } | undefined)?.message
        : undefined;
      setError(!isRegistering && responseMessage === 'Votre compte a été désactivé. Vous pouvez demander sa réactivation.'
        ? t(responseMessage)
        : t(responseMessage ?? 'Identifiant ou mot de passe incorrect.'));
    }
  };

  const requestReactivation = async () => {
    setError('');
    setInfo('');
    try {
      const result = await authService.requestReactivation({ identifier, password, reason: reactivationReason });
      setReactivationRequested(true);
      setInfo(t(result.message));
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'La demande de réactivation n’a pas pu être envoyée.'));
    }
  };

  const updateOtp = (index: number, value: string) => {
    const entered = value.replace(/\D/g, '');
    const next = Array.from({ length: 6 }, (_, position) => otp[position] ?? ' ');
    if (entered.length > 1) {
      const digits = entered.slice(0, 6 - index);
      digits.split('').forEach((digit, offset) => { next[index + offset] = digit; });
      setOtp(next.join(''));
      otpInputs.current[Math.min(index + digits.length, 5)]?.focus();
      return;
    }
    const digits = entered.slice(-1);
    next[index] = digits || ' ';
    setOtp(next.join(''));
    if (digits && index < otpInputs.current.length - 1) otpInputs.current[index + 1]?.focus();
  };

  const pasteOtp = (event: ClipboardEvent<HTMLInputElement>) => {
    event.preventDefault();
    const digits = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    setOtp(digits.padEnd(6, ' '));
    otpInputs.current[Math.min(digits.length, 5)]?.focus();
  };

  function getErrorMessage(requestError: unknown, fallback: string) {
    return axios.isAxiosError(requestError)
      ? (requestError.response?.data as { message?: string } | undefined)?.message ?? fallback
      : fallback;
  }

  const changeFlow = (next: typeof flow) => {
    setFlow(next);
    setError('');
    setInfo('');
    setReactivationRequested(false);
    if (next === 'forgot-email' && identifier.includes('@')) setResetEmail(identifier);
  };

  return (
    <main className="login-page">
      <div className="login-character" aria-hidden="true">
        <svg viewBox="0 0 170 190" focusable="false">
          <g className="login-character-chair">
            <path d="M44 111v-27h40v27M39 114h51M48 115l-5 42m42-42 5 42" />
          </g>
          <g className="login-character-standing">
            <path className="login-character-trousers" d="m52 111-5 47 12 2 10-34 8 34 12-2-5-47z" />
            <path className="login-character-shoe" d="M46 157h15l-2 7H43q-3-3 3-7m29 0h15l5 7H77q-3-3-2-7" />
            <path className="login-character-shirt" d="M56 61q14-8 28 0l9 52q-22 9-46 0z" />
            <path className="login-character-arm" d="m82 68 15 4 20-14" />
            <path className="login-character-arm-other" d="m57 69-11 24 12 8" />
            <path className="login-character-neck" d="M65 53h12v13H65z" />
            <circle className="login-character-skin" cx="71" cy="36" r="17" />
            <path className="login-character-hair" d="M54 34q1-19 18-18 15 1 17 16l-8-5-7 3-10-4-9 8z" />
          </g>
          <g className="login-character-seated">
            <path className="login-character-trousers" d="m53 108 29 2 17 18-9 10-22-13-13 21-11-7 10-25z" />
            <path className="login-character-shoe" d="m67 142 12 5-3 7-18-7q-1-4 9-5m23-8 11-8 6 6-13 13-8-4z" />
            <path className="login-character-shirt" d="M56 61q14-8 28 0l9 51q-21 7-46-2z" />
            <path className="login-character-arm" d="m83 69 13 17 13 2" />
            <path className="login-character-arm-other" d="m57 70-9 24 12 10" />
            <path className="login-character-neck" d="M65 53h12v13H65z" />
            <circle className="login-character-skin" cx="71" cy="36" r="17" />
            <path className="login-character-hair" d="M54 34q1-19 18-18 15 1 17 16l-8-5-7 3-10-4-9 8z" />
          </g>
          <path className="login-character-rope" d="M116 59h50" />
        </svg>
      </div>
      <section className="login-visual">
        <div className="login-visual-inner">
          <img src="/logoPrefet.jpg" alt={t('Logo de la préfecture')} className="login-logo" />
          <p className="eyebrow">{t('E-Servisy d’Ihosy')}</p>
          <h2>{t('Un guichet unique pour l’administration.')}</h2>
          <p className="login-visual-copy">
            {t('Suivez vos demandes, consultez les services et accédez à votre espace personnel en quelques clics.')}
          </p>
          <ul className="login-features">
            <li>{t('Citoyens')}</li>
            <li>{t('Administrateurs')}</li>
            <li>{t('Dossiers')}</li>
          </ul>
        </div>
      </section>

      <section className="login-panel">
        <div className={`login-panel-inner${isRegistering ? ' is-registering' : ''}`}>
          <p className="eyebrow login-eyebrow">{t(isRegistering ? 'Inscription citoyenne' : isForgotFlow ? 'Récupération du mot de passe' : 'Connexion')}</p>
          <h1>{t(isRegistering ? 'Créer un compte' : isForgotFlow ? 'Mot de passe oublié' : 'Bienvenue')}</h1>
          <p className="login-subtitle">{t(isRegistering ? 'Créez votre espace pour suivre vos démarches.' : isForgotFlow ? 'Un code de vérification sera envoyé à l’adresse email associée à votre compte.' : 'Accédez à votre espace citoyen ou administrateur.')}</p>

          <form onSubmit={submit}>
            {flow === 'login' || isRegistering ? <label>
              {t(isRegistering ? 'Email (facultatif)' : 'Email, téléphone ou CIN')}
              <input
                type={isRegistering ? 'email' : 'text'}
                value={identifier}
                onChange={(event) => setIdentifier(event.target.value)}
                autoComplete="username"
                required={!isRegistering}
              />
              {isRegistering && <small>{t('L’adresse email est facultative, mais nécessaire pour réinitialiser votre mot de passe oublié.')}</small>}
            </label> : null}

            {isRegistering && <>
              <label>{t('Nom complet')}<input value={nom} onChange={(event) => setNom(event.target.value)} autoComplete="name" required /></label>
              <label>{t(identifier.trim() ? 'Téléphone (optionnel, utilisable pour la connexion)' : 'Téléphone (obligatoire sans email)')}<input value={phone} onChange={(event) => setPhone(event.target.value)} autoComplete="tel" required={!identifier.trim()} /></label>
              <fieldset className="login-age-field">
                <legend>{t('Avez-vous 18 ans ou plus ?')}</legend>
                <div className="login-age-options">
                  <label><input type="radio" name="isAdult" value="yes" required checked={isAdult === true} onChange={() => setIsAdult(true)} />{t('Oui')}</label>
                  <label><input type="radio" name="isAdult" value="no" required checked={isAdult === false} onChange={() => { setIsAdult(false); setCin(''); }} />{t('Non')}</label>
                </div>
              </fieldset>
              {isAdult && <label>{t('CIN (12 chiffres)')}<input value={cin} onChange={(event) => setCin(event.target.value)} inputMode="numeric" maxLength={12} pattern="[0-9]{12}" autoComplete="off" required /></label>}
            </>}

            {flow === 'login' || isRegistering ? <div className="login-password-field">
              <label>
                {t('Mot de passe')}
                <span className="password-field">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete={isRegistering ? 'new-password' : 'current-password'}
                    required
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() => setShowPassword((visible) => !visible)}
                    aria-label={t(showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe')}
                    title={t(showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe')}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </span>
              </label>
              {flow === 'login' && <button className="text-link forgot-password-link" type="button" onClick={() => changeFlow('forgot-email')}>{t('Mot de passe oublié ?')}</button>}
            </div> : null}

            {flow === 'forgot-email' && <label>{t('Adresse email')}<input type="email" autoComplete="email" value={resetEmail} onChange={(event) => setResetEmail(event.target.value)} required /></label>}
            {flow === 'forgot-code' && <>
              <fieldset className="otp-field">
                <legend>{t('Code OTP reçu par email')}</legend>
                <div className="otp-inputs" dir="ltr">
                  {Array.from({ length: 6 }, (_, index) => <input
                    key={index}
                    ref={(element) => { otpInputs.current[index] = element; }}
                    aria-label={t('Chiffre {{number}} du code OTP', { number: index + 1 })}
                    inputMode="numeric"
                    autoComplete={index === 0 ? 'one-time-code' : 'off'}
                    maxLength={1}
                    value={otp[index]?.trim() ?? ''}
                    onChange={(event) => updateOtp(index, event.target.value)}
                    onPaste={pasteOtp}
                    onKeyDown={(event) => {
                      if (event.key === 'Backspace' && !otp[index]?.trim() && index > 0) otpInputs.current[index - 1]?.focus();
                      if (event.key === 'ArrowLeft' && index > 0) otpInputs.current[index - 1]?.focus();
                      if (event.key === 'ArrowRight' && index < 5) otpInputs.current[index + 1]?.focus();
                    }}
                    required
                  />)}
                </div>
              </fieldset>
              <label>{t('Nouveau mot de passe')}<span className="password-field">
                <input type={showNewPassword ? 'text' : 'password'} autoComplete="new-password" minLength={8} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required />
                <button type="button" className="password-toggle" onClick={() => setShowNewPassword((visible) => !visible)} aria-label={t(showNewPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe')} title={t(showNewPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe')}>
                  {showNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </span></label>
            </>}

            {error && <p className="error-message" role="alert">{error}</p>}
            {info && <p className="success-message" role="status">{info}</p>}
            <button className="button primary full" type="submit">{t(isRegistering ? 'Créer mon compte' : flow === 'forgot-email' ? 'Envoyer le code OTP' : flow === 'forgot-code' ? 'Réinitialiser le mot de passe' : 'Se connecter')}</button>
          </form>
          {error === t('Votre compte a été désactivé. Vous pouvez demander sa réactivation.') && !reactivationRequested && <section className="reactivation-request">
            <p>{t('Votre compte est désactivé. Confirmez votre identifiant et mot de passe ci-dessus pour envoyer une demande de réactivation.')}</p>
            <label>{t('Motif (facultatif)')}<textarea rows={3} maxLength={1000} value={reactivationReason} onChange={(event) => setReactivationReason(event.target.value)} /></label>
            <button className="button" type="button" onClick={() => void requestReactivation()}>{t('Demander la réactivation')}</button>
          </section>}
          {flow === 'forgot-code' && <button className="text-link auth-switch" type="button" onClick={() => { setError(''); setInfo(''); setFlow('forgot-email'); }}>{t('Renvoyer un code OTP')}</button>}
          {isForgotFlow
            ? <button className="text-link auth-switch" type="button" onClick={() => changeFlow('login')}>{t('Retour à la connexion')}</button>
            : <button className="text-link auth-switch" type="button" onClick={() => { changeFlow(isRegistering ? 'login' : 'register'); setIsAdult(null); setCin(''); }}>{t(isRegistering ? 'J’ai déjà un compte' : 'Créer un compte citoyen')}</button>}
        </div>
      </section>
    </main>
  );
}