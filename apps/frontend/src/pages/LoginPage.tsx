import { FormEvent, useEffect, useRef, useState, type ClipboardEvent, type PointerEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import axios from 'axios';
import { useAuth } from '../auth';
import { usePreferences } from '../preferences';
import { authService } from '../services/api';

export function LoginPage({ adminPortal = false }: { adminPortal?: boolean }) {
  const [flow, setFlow] = useState<'login' | 'register' | 'forgot-identifier' | 'forgot-code' | 'forgot-complete' | 'temporary-password-change'>('login');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const isRegistering = flow === 'register';
  const isForgotFlow = flow === 'forgot-identifier' || flow === 'forgot-code' || flow === 'forgot-complete';
  const [nom, setNom] = useState('');
  const [phone, setPhone] = useState('');
  const [cin, setCin] = useState('');
  const [isAdult, setIsAdult] = useState<boolean | null>(null);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [resetIdentifier, setResetIdentifier] = useState('');
  const [otp, setOtp] = useState('      ');
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordConfirmation, setNewPasswordConfirmation] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const otpInputs = useRef<Array<HTMLInputElement | null>>([]);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [resetChannel, setResetChannel] = useState<'EMAIL' | 'SMS' | 'CIN'>('EMAIL');
  const [reactivationReason, setReactivationReason] = useState('');
  const [reactivationRequested, setReactivationRequested] = useState(false);
  const { login, register, user, logout } = useAuth();
  const { t } = usePreferences();
  const navigate = useNavigate();

  useEffect(() => {
    if (user?.mustChangePassword) setFlow('temporary-password-change');
  }, [user?.mustChangePassword]);

  const getErrorMessage = (requestError: unknown, fallback: string) => {
    if (axios.isAxiosError(requestError)) {
      if (!requestError.response) {
        return t(navigator.onLine
          ? 'Le serveur est momentanément inaccessible. Vérifiez votre connexion et réessayez.'
          : 'Aucune connexion Internet. Reconnectez-vous puis réessayez.');
      }
      const message = (requestError.response.data as { message?: string } | undefined)?.message;
      if (message) return t(message);
    }
    return fallback;
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setInfo('');
    if (flow === 'forgot-identifier') {
      try {
        const result = await authService.requestPasswordReset(resetIdentifier, resetChannel);
        setInfo(t(result.message));
        setFlow(result.requiresOtp ? 'forgot-code' : 'forgot-complete');
      } catch (requestError) {
        if (axios.isAxiosError(requestError) && !requestError.response) {
          window.dispatchEvent(new Event('archives:connection-error'));
          return;
        }
        setError(getErrorMessage(requestError, t('Impossible d’envoyer le code de réinitialisation.')));
      }
      return;
    }
    if (flow === 'forgot-code') {
      if (newPassword !== newPasswordConfirmation) {
        setError(t('Les nouveaux mots de passe ne correspondent pas.'));
        return;
      }
      try {
        const result = await authService.resetPassword({ identifier: resetIdentifier, code: otp.replace(/\s/g, ''), password: newPassword });
        setFlow('login');
        setIdentifier(resetIdentifier);
        setPassword('');
        setOtp('      ');
        setNewPassword('');
        setNewPasswordConfirmation('');
        setInfo(t(result.message));
      } catch (requestError) {
        setError(getErrorMessage(requestError, t('La réinitialisation du mot de passe a échoué.')));
      }
      return;
    }
    if (flow === 'temporary-password-change') {
      if (newPassword.length < 8 || newPassword !== newPasswordConfirmation) {
        setError(t(newPassword.length < 8 ? 'Le nouveau mot de passe doit contenir au moins 8 caractères.' : 'Les nouveaux mots de passe ne correspondent pas.'));
        return;
      }
      try {
        const result = await authService.changePassword('', newPassword);
        await logout();
        setPassword('');
        setNewPassword('');
        setNewPasswordConfirmation('');
        setFlow('login');
        setInfo(t(result.message));
      } catch (requestError) {
        setError(getErrorMessage(requestError, t('Le changement de mot de passe a échoué.')));
      }
      return;
    }
    try {
      const user = isRegistering
        ? await register({ email: identifier, password, nom, phone: phone || undefined, cin: isAdult ? cin : undefined, isAdult: isAdult === true })
        : await login(identifier, password, adminPortal);
      if (user) {
        if (user.mustChangePassword) {
          setFlow('temporary-password-change');
          setNewPassword('');
          setNewPasswordConfirmation('');
          setInfo(t('Votre mot de passe temporaire a été accepté. Choisissez maintenant un nouveau mot de passe.'));
          return;
        }
        const defaultPath = adminPortal ? '/back/accueil' : '/front/accueil';
        navigate(defaultPath, { replace: true });
        return;
      }
      setError(t('Identifiant ou mot de passe incorrect.'));
    } catch (requestError) {
      const responseMessage = axios.isAxiosError(requestError)
        ? (requestError.response?.data as { message?: string } | undefined)?.message
        : undefined;
      if (axios.isAxiosError(requestError) && !requestError.response) {
        setError(getErrorMessage(requestError, t('Identifiant ou mot de passe incorrect.')));
      } else {
        setError(!isRegistering && responseMessage === 'Votre compte a été désactivé. Vous pouvez demander sa réactivation.'
          ? t(responseMessage)
          : t(responseMessage ?? 'Identifiant ou mot de passe incorrect.'));
      }
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

  const changeFlow = (next: typeof flow) => {
    setFlow(next);
    setError('');
    setInfo('');
    setReactivationRequested(false);
    if (next === 'forgot-identifier') {
      setResetIdentifier('');
      setResetChannel('EMAIL');
    }
    if (next === 'login') {
      setIsAdult(null);
      setCin('');
    }
  };

  const switchAuthMode = () => {
    changeFlow(isRegistering ? 'login' : 'register');
  };

  // Keep the pointer tilt subtle and limited to desktop mouse input.
  const handleCardPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const tiltX = ((event.clientY - bounds.top) / bounds.height - 0.5) * -4;
    const tiltY = ((event.clientX - bounds.left) / bounds.width - 0.5) * 4;
    event.currentTarget.style.setProperty('--login-tilt-x', `${tiltX}deg`);
    event.currentTarget.style.setProperty('--login-tilt-y', `${tiltY}deg`);
  };

  const resetCardTilt = () => {
    cardRef.current?.style.setProperty('--login-tilt-x', '0deg');
    cardRef.current?.style.setProperty('--login-tilt-y', '0deg');
  };

  return (
    <main className={`login-page${isRegistering ? ' is-registering' : ''}`}>
      <section className="login-visual" aria-live="polite">
        <div className="login-visual-inner">
          <img src="/logoPrefet.png" alt={t('Logo de la préfecture')} className="login-logo" />
          <p className="eyebrow">{t('E-Servisy d’Ihosy')}</p>
          <h2 key={isRegistering ? 'register-heading' : 'login-heading'} className="login-panel-message">{t(isRegistering ? 'Créer un compte citoyen' : adminPortal ? 'Connexion administrateur' : 'Un guichet unique pour l’administration.')}</h2>
          <p key={isRegistering ? 'register-copy' : 'login-copy'} className="login-visual-copy">
            {t(isRegistering ? 'Créez votre espace pour suivre vos démarches.' : adminPortal ? 'Accédez à votre espace sécurisé de gestion.' : 'Suivez vos demandes, consultez les services et accédez à votre espace personnel en quelques clics.')}
          </p>
          <ul className="login-features">
            <li>{t('Citoyens')}</li>
            <li>{t('Administrateurs')}</li>
            <li>{t('Dossiers')}</li>
          </ul>
        </div>
      </section>

      <section className="login-panel">
        <div
          ref={cardRef}
          className={`login-panel-inner${isRegistering ? ' is-registering' : ''}`}
          onPointerMove={handleCardPointerMove}
          onPointerLeave={resetCardTilt}
        >
          <div className="login-panel-content">
          <p className="eyebrow login-eyebrow">{t(isRegistering ? 'Inscription citoyenne' : isForgotFlow || flow === 'temporary-password-change' ? 'Récupération du mot de passe' : adminPortal ? 'Espace administrateur' : 'Connexion citoyenne')}</p>
          <h1>{t(isRegistering ? 'Créer un compte' : flow === 'temporary-password-change' ? 'Choisir un nouveau mot de passe' : isForgotFlow ? 'Mot de passe oublié' : 'Bienvenue')}</h1>
          <p className="login-subtitle">{t(isRegistering ? 'Créez votre espace pour suivre vos démarches.' : flow === 'temporary-password-change' ? 'Pour protéger votre compte, le mot de passe temporaire ne peut pas être réutilisé. Définissez votre mot de passe personnel.' : isForgotFlow ? 'Choisissez une méthode pour récupérer votre compte.' : adminPortal ? 'Cette page est réservée aux comptes administrateurs.' : 'Accédez à votre espace citoyen.')}</p>

          {flow !== 'forgot-complete' && <form key={isRegistering ? 'register-form' : flow} className="login-flow-form" onSubmit={submit}>
            {flow === 'login' || isRegistering ? <label className="login-floating-field">
              <span>{t(isRegistering ? 'Email (facultatif)' : 'Email, téléphone ou CIN')}</span>
              <input
                type={isRegistering ? 'email' : 'text'}
                value={identifier}
                onChange={(event) => setIdentifier(event.target.value)}
                autoComplete="username"
                required={!isRegistering}
                placeholder=" "
                aria-label={t(isRegistering ? 'Email (facultatif)' : 'Email, téléphone ou CIN')}
              />
              {isRegistering && <small>{t('L’email permet la récupération en ligne. Sans email, la récupération se fait au guichet (CIN requise).')}</small>}
            </label> : null}

            {isRegistering && <>
              <label className="login-floating-field"><span>{t('Nom complet')}</span><input value={nom} onChange={(event) => setNom(event.target.value)} autoComplete="name" placeholder=" " aria-label={t('Nom complet')} required /></label>
              <label className="login-floating-field"><span>{t(identifier.trim() ? 'Téléphone (optionnel, utilisable pour la connexion)' : 'Téléphone (obligatoire sans email)')}</span><input value={phone} onChange={(event) => setPhone(event.target.value)} autoComplete="tel" placeholder=" " aria-label={t('Téléphone') } required={!identifier.trim()} /></label>
              <fieldset className="login-age-field">
                <legend>{t('Avez-vous 18 ans ou plus ?')}</legend>
                <div className="login-age-options">
                  <label><input type="radio" name="isAdult" value="yes" required checked={isAdult === true} onChange={() => setIsAdult(true)} />{t('Oui')}</label>
                  <label><input type="radio" name="isAdult" value="no" required checked={isAdult === false} onChange={() => { setIsAdult(false); setCin(''); }} />{t('Non')}</label>
                </div>
              </fieldset>
              {isAdult && <label className="login-floating-field"><span>{t('CIN (12 chiffres)')}</span><input value={cin} onChange={(event) => setCin(event.target.value)} inputMode="numeric" maxLength={12} pattern="[0-9]{12}" autoComplete="off" placeholder=" " aria-label={t('CIN (12 chiffres)')} required /></label>}
            </>}

            {flow === 'login' || isRegistering ? <div className="login-password-field">
              <label className="login-floating-field">
                <span>{t('Mot de passe')}</span>
                <span className="password-field">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete={isRegistering ? 'new-password' : 'current-password'}
                    placeholder=" "
                    aria-label={t('Mot de passe')}
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
              {flow === 'login' && <button className="text-link forgot-password-link" type="button" onClick={() => changeFlow('forgot-identifier')}>{t('Mot de passe oublié ?')}</button>}
            </div> : null}

            {flow === 'forgot-identifier' && <>
              <label className="login-reset-method">
                <span>{t('Méthode de récupération')}</span>
                <select value={resetChannel} onChange={(event) => {
                  const channel = event.target.value === 'SMS' ? 'SMS' : event.target.value === 'CIN' ? 'CIN' : 'EMAIL';
                  setResetChannel(channel);
                  setResetIdentifier('');
                  setError('');
                  setInfo('');
                }}>
                  <option value="EMAIL">{t('Email')}</option>
                  <option value="SMS">{t('Numéro de téléphone (SMS)')}</option>
                  <option value="CIN">{t('CIN')}</option>
                </select>
              </label>
              <label className="login-floating-field">
                <span>{t(resetChannel === 'EMAIL' ? 'Adresse email' : resetChannel === 'SMS' ? 'Numéro de téléphone' : 'CIN (12 chiffres)')}</span>
                <input
                  type={resetChannel === 'EMAIL' ? 'email' : resetChannel === 'SMS' ? 'tel' : 'text'}
                  inputMode={resetChannel === 'CIN' ? 'numeric' : undefined}
                  autoComplete={resetChannel === 'EMAIL' ? 'email' : resetChannel === 'SMS' ? 'tel' : 'off'}
                  maxLength={resetChannel === 'CIN' ? 12 : undefined}
                  pattern={resetChannel === 'CIN' ? '[0-9]{12}' : undefined}
                  value={resetIdentifier}
                  onChange={(event) => setResetIdentifier(event.target.value)}
                  placeholder=" "
                  aria-label={t(resetChannel === 'EMAIL' ? 'Adresse email' : resetChannel === 'SMS' ? 'Numéro de téléphone' : 'CIN (12 chiffres)')}
                  required
                />
              </label>
            </>}
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
              <label className="login-floating-field"><span>{t('Nouveau mot de passe')}</span><input type="password" autoComplete="new-password" minLength={8} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder=" " aria-label={t('Nouveau mot de passe')} required /></label>
              <label className="login-floating-field"><span>{t('Confirmer le nouveau mot de passe')}</span><input type="password" autoComplete="new-password" minLength={8} value={newPasswordConfirmation} onChange={(event) => setNewPasswordConfirmation(event.target.value)} placeholder=" " aria-label={t('Confirmer le nouveau mot de passe')} required /></label>
            </>}
            {flow === 'temporary-password-change' && <>
              <label className="login-floating-field"><span>{t('Nouveau mot de passe')}</span><span className="password-field">
                <input type={showNewPassword ? 'text' : 'password'} autoComplete="new-password" minLength={8} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder=" " aria-label={t('Nouveau mot de passe')} required />
                <button type="button" className="password-toggle" onClick={() => setShowNewPassword((visible) => !visible)} aria-label={t(showNewPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe')} title={t(showNewPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe')}>
                  {showNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </span></label>
              <label className="login-floating-field"><span>{t('Confirmer le nouveau mot de passe')}</span><input type="password" autoComplete="new-password" minLength={8} value={newPasswordConfirmation} onChange={(event) => setNewPasswordConfirmation(event.target.value)} placeholder=" " aria-label={t('Confirmer le nouveau mot de passe')} required /></label>
            </>}

            <button className="button primary full" type="submit">{t(isRegistering ? 'Créer mon compte' : flow === 'forgot-identifier' ? 'Continuer' : flow === 'forgot-code' ? 'Réinitialiser le mot de passe' : flow === 'temporary-password-change' ? 'Enregistrer le nouveau mot de passe' : 'Se connecter')}</button>
          </form>}
          {error && <p className="error-message" role="alert">{error}</p>}
          {info && <p className="success-message" role="status">{info}</p>}
          {error === t('Votre compte a été désactivé. Vous pouvez demander sa réactivation.') && !reactivationRequested && <section className="reactivation-request">
            <p>{t('Votre compte est désactivé. Confirmez votre identifiant et mot de passe ci-dessus pour envoyer une demande de réactivation.')}</p>
            <label className="login-floating-field"><span>{t('Motif (facultatif)')}</span><textarea rows={3} maxLength={1000} value={reactivationReason} onChange={(event) => setReactivationReason(event.target.value)} placeholder=" " aria-label={t('Motif (facultatif)')} /></label>
            <button className="button" type="button" onClick={() => void requestReactivation()}>{t('Demander la réactivation')}</button>
          </section>}
          {flow === 'forgot-code' && <button className="text-link auth-switch" type="button" onClick={() => { setError(''); setInfo(''); setFlow('forgot-identifier'); }}>{t('Renvoyer un code OTP')}</button>}
          {flow === 'temporary-password-change' ? null : isForgotFlow
            ? <button className="text-link auth-switch" type="button" onClick={() => changeFlow('login')}>{t('Retour à la connexion')}</button>
            : adminPortal
              ? null
              : <button key={isRegistering ? 'login-switch' : 'register-switch'} className="text-link auth-switch login-auth-switch" type="button" aria-label={t(isRegistering ? 'Se connecter' : 'S’inscrire')} onClick={switchAuthMode}>{t(isRegistering ? 'J’ai déjà un compte' : 'Créer un compte citoyen')}</button>}
          </div>
        </div>
      </section>
    </main>
  );
}