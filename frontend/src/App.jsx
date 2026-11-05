import { useEffect } from 'react';
import { DrawSection } from './components/DrawSection.jsx';
import { EventSection } from './components/EventSection.jsx';
import { Icon } from './components/Icon.jsx';
import { ParticipantsSection } from './components/ParticipantsSection.jsx';
import { RulesSection } from './components/RulesSection.jsx';
import { useAppState } from './hooks/useAppState.js';
import { useDrawValidation } from './hooks/useDrawValidation.js';
import { useHealth } from './hooks/useHealth.js';

const SAVE_LABEL = {
  saving: 'Salvando…',
  saved: 'Tudo salvo',
  error: 'Erro ao salvar — verifique o servidor',
};

export default function App() {
  const state = useAppState();
  const { participants, setParticipants, rules, setRules, event, setEvent, lastDraw, setLastDraw } = state;
  const [health, retryHealth] = useHealth();
  const validation = useDrawValidation(participants, rules, health.status === 'ok');

  // Se o backend demorou a subir, confere de novo o status do email assim que os dados carregarem.
  const loaded = state.loadStatus === 'ready';
  useEffect(() => {
    if (loaded && health.status === 'offline') retryHealth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  const removeParticipant = (id) => {
    setParticipants((list) => list.filter((p) => p.id !== id));
    setRules((list) => list.filter((r) => r.from !== id && r.to !== id));
  };

  const clearParticipants = () => {
    setParticipants([]);
    setRules([]);
  };

  return (
    <>
      <header className="hero">
        <div className="hero-inner">
          <span className="hero-logo" aria-hidden="true">
            🎁
          </span>
          <h1>Amigo Oculto</h1>
          <p>Cadastre a turma, defina as regras e deixe o sorteio com a gente. Cada pessoa descobre por email quem tirou.</p>
          <ol className="hero-steps">
            <li>
              <Icon name="users" size={16} /> Participantes
            </li>
            <li>
              <Icon name="ban" size={16} /> Regras
            </li>
            <li>
              <Icon name="mail" size={16} /> Sorteio por email
            </li>
          </ol>
        </div>
      </header>

      <main className="container">
        {state.loadStatus === 'loading' && (
          <section className="card loading-card">
            <span className="spinner small" /> Carregando seus dados…
          </section>
        )}

        {state.loadStatus === 'error' && (
          <section className="card offline-card">
            <span className="empty-icon">🔌</span>
            <h2>Não foi possível conectar ao servidor</h2>
            <p>Verifique se o backend está rodando (npm run dev) e tente de novo.</p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                state.reload();
                retryHealth();
              }}
            >
              <Icon name="refresh" /> Tentar de novo
            </button>
          </section>
        )}

        {state.loadStatus === 'ready' && (
          <>
            <ParticipantsSection
              participants={participants}
              setParticipants={setParticipants}
              onRemove={removeParticipant}
              onClear={clearParticipants}
            />
            <RulesSection participants={participants} rules={rules} setRules={setRules} />
            <EventSection event={event} setEvent={setEvent} />
            <DrawSection
              participants={participants}
              rules={rules}
              event={event}
              validation={validation}
              health={health}
              onRetryHealth={retryHealth}
              lastDraw={lastDraw}
              setLastDraw={setLastDraw}
            />
          </>
        )}
      </main>

      {state.loadStatus === 'ready' && (
        <div className={`save-indicator ${state.saveStatus}`} role="status" aria-live="polite">
          {state.saveStatus === 'saving' ? (
            <span className="spinner small" />
          ) : (
            <Icon name={state.saveStatus === 'error' ? 'alert' : 'check'} size={14} strokeWidth={3} />
          )}
          {SAVE_LABEL[state.saveStatus]}
        </div>
      )}

      <footer className="footer">
        <p>🤫 O resultado nunca aparece na tela — só no email de cada participante.</p>
      </footer>
    </>
  );
}
