import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../auth';
import { usePreferences } from '../preferences';

export function LoginPage() {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [nom, setNom] = useState('');
  const [phone, setPhone] = useState('');
  const [cin, setCin] = useState('');
  const [error, setError] = useState(false);
  const { login, register } = useAuth();
  const { t } = usePreferences();
  const navigate = useNavigate();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const user = isRegistering
      ? await register({ email: identifier, password, nom, phone: phone || undefined, cin: cin || undefined })
      : await login(identifier, password);
    if (user) {
      const defaultPath = user.roles.includes('CITIZEN') ? '/front/accueil' : '/back/accueil';
      navigate(defaultPath, { replace: true });
      return;
    }
    setError(true);
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
          <p className="eyebrow login-eyebrow">{t(isRegistering ? 'Inscription citoyenne' : 'Connexion')}</p>
          <h1>{t(isRegistering ? 'Créer un compte' : 'Bienvenue')}</h1>
          <p className="login-subtitle">{t(isRegistering ? 'Créez votre espace pour suivre vos démarches.' : 'Accédez à votre espace citoyen ou administrateur.')}</p>

          <form onSubmit={submit}>
            <label>
              {t('Email')}
              <input
                value={identifier}
                onChange={(event) => setIdentifier(event.target.value)}
                autoComplete="username"
                required
              />
            </label>

            {isRegistering && <>
              <label>{t('Nom complet')}<input value={nom} onChange={(event) => setNom(event.target.value)} autoComplete="name" required /></label>
              <label>{t('Téléphone (optionnel)')}<input value={phone} onChange={(event) => setPhone(event.target.value)} autoComplete="tel" /></label>
              <label>{t('CIN (optionnel)')}<input value={cin} onChange={(event) => setCin(event.target.value)} /></label>
            </>}

            <label>
              {t('Mot de passe')}
              <span className="password-field">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
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

            {error && <p className="error-message">{t('Identifiant ou mot de passe incorrect.')}</p>}
            <button className="button primary full" type="submit">{t(isRegistering ? 'Créer mon compte' : 'Se connecter')}</button>
          </form>
          <button className="text-link auth-switch" type="button" onClick={() => { setIsRegistering((value) => !value); setError(false); }}>
            {t(isRegistering ? 'J’ai déjà un compte' : 'Créer un compte citoyen')}
          </button>
        </div>
      </section>
    </main>
  );
}