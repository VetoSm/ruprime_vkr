import { ReactNode, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../store/AuthContext';
import { TERMS_VERSION } from '../pages/Terms';

/**
 * Blocking gate shown to authenticated users whose stored consent_version
 * does not match the current TERMS_VERSION. It renders the app underneath
 * but covers it with a modal until the user ticks the checkbox and hits
 * "Accept". The Accept handler calls POST /auth/accept-consent and updates
 * AuthContext in place, which hides the gate.
 *
 * Legacy users (registered before consent tracking) always hit this gate
 * on their next login — that's how they get surfaced to the new documents.
 */
export default function ConsentGate({ children }: { children: ReactNode }) {
  const { user, acceptConsent } = useAuth();
  const [accepted, setAccepted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needConsent =
    Boolean(user) && (!user?.consent_version || user.consent_version !== TERMS_VERSION);

  const submit = async () => {
    setSaving(true); setError(null);
    try {
      await acceptConsent(TERMS_VERSION);
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Не удалось сохранить согласие. Попробуйте ещё раз.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {children}
      {needConsent && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(4, 10, 24, 0.85)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2000,
            padding: 16,
          }}
        >
          <div
            className="card"
            style={{
              width: '100%',
              maxWidth: 520,
              padding: 24,
              border: '1px solid var(--accent)',
            }}
          >
            <h2 style={{ margin: '0 0 10px', fontSize: '1.2rem' }}>Новые условия использования</h2>
            <p className="text-muted" style={{ fontSize: '0.9rem', marginBottom: 12, lineHeight: 1.55 }}>
              Мы обновили пользовательское соглашение и политику конфиденциальности. Документы
              описывают, какие данные сервис получает через Steam Web API и OpenDota, зачем и как
              вы можете ими управлять.
            </p>

            <p className="text-muted" style={{ fontSize: '0.85rem', marginBottom: 12 }}>
              Пожалуйста, ознакомьтесь:
              {' '}<Link to="/terms" target="_blank" rel="noreferrer">Пользовательское соглашение</Link>{' '}
              ·{' '}
              <Link to="/privacy" target="_blank" rel="noreferrer">Политика конфиденциальности</Link>
              {' '}(версия {TERMS_VERSION}).
            </p>

            {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>}

            <label
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 10,
                padding: '12px 14px',
                border: '1px solid var(--border-color)',
                borderRadius: 10,
                background: 'rgba(5, 16, 36, 0.6)',
                marginBottom: 14,
                cursor: 'pointer',
                fontSize: '0.85rem',
                color: 'var(--text-secondary)',
                lineHeight: 1.55,
              }}
            >
              <input
                type="checkbox"
                checked={accepted}
                onChange={(e) => setAccepted(e.target.checked)}
                style={{ marginTop: 3, width: 16, height: 16, flexShrink: 0 }}
              />
              <span>
                Я прочитал/прочитала документы и принимаю условия. Разрешаю сервису получать через Steam
                Web API мой публичный профиль (SteamID, ник, аватар, общие часы в Dota 2) и через
                OpenDota — матчевую статистику, если она открыта в настройках Dota 2.
              </span>
            </label>

            <div className="flex gap-10" style={{ flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <Link to="/privacy" target="_blank" rel="noreferrer" className="btn btn-outline">
                Открыть политику
              </Link>
              <button
                className="btn btn-primary"
                disabled={!accepted || saving}
                onClick={submit}
              >
                {saving ? 'Сохраняем...' : 'Принимаю'}
              </button>
            </div>

            <p className="text-muted" style={{ fontSize: '0.72rem', marginTop: 14 }}>
              Если вы не согласны с условиями — вы можете удалить аккаунт, написав на
              {' '}<a href="mailto:support@ru-prime.ru">support@ru-prime.ru</a>.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
