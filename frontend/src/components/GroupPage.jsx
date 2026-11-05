import { useEffect } from 'react';
import { useAppState } from '../hooks/useAppState.js';
import { useDrawValidation } from '../hooks/useDrawValidation.js';
import { useHealth } from '../hooks/useHealth.js';
import { LIST_HREF } from '../hooks/useRoute.js';
import { STATUS_LABEL, groupStatus } from '../utils.js';
import { DrawSection } from './DrawSection.jsx';
import { EventSection } from './EventSection.jsx';
import { Icon } from './Icon.jsx';
import { ParticipantsSection } from './ParticipantsSection.jsx';
import { RulesSection } from './RulesSection.jsx';
import { SecretAreaSection } from './SecretAreaSection.jsx';

const SAVE_LABEL = {
  saving: 'Salvando…',
  saved: 'Tudo salvo',
  error: 'Erro ao salvar — verifique o servidor',
};

const BackLink = () => (
  <a className="btn-link" href={LIST_HREF}>
    <Icon name="back" size={16} /> Todos os amigos ocultos
  </a>
);

/** Tela de um amigo oculto: participantes, regras, evento e sorteio. */
export function GroupPage({ groupId }) {
  const state = useAppState(groupId);
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

  if (state.loadStatus === 'loading') {
    return (
      <section className="card loading-card">
        <span className="spinner small" /> Carregando o amigo oculto…
      </section>
    );
  }

  if (state.loadStatus === 'notfound') {
    return (
      <section className="card offline-card">
        <span className="empty-icon">🔍</span>
        <h2>Amigo oculto não encontrado</h2>
        <p>Ele pode ter sido apagado.</p>
        <BackLink />
      </section>
    );
  }

  if (state.loadStatus === 'error') {
    return (
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
    );
  }

  const status = groupStatus(event, Boolean(lastDraw));

  return (
    <>
      <section className="card group-banner">
        <BackLink />
        <div className="group-banner-title">
          <h2>{event.name || 'Amigo oculto sem nome'}</h2>
          <span className={`group-status ${status}`}>{STATUS_LABEL[status]}</span>
        </div>
      </section>

      <ParticipantsSection
        participants={participants}
        setParticipants={setParticipants}
        onRemove={removeParticipant}
        onClear={clearParticipants}
      />
      <RulesSection participants={participants} rules={rules} setRules={setRules} validation={validation} />
      <EventSection event={event} setEvent={setEvent} />
      <DrawSection
        groupId={groupId}
        participants={participants}
        rules={rules}
        event={event}
        validation={validation}
        health={health}
        onRetryHealth={retryHealth}
        lastDraw={lastDraw}
        setLastDraw={setLastDraw}
      />
      {lastDraw && <SecretAreaSection groupId={groupId} />}

      <div className={`save-indicator ${state.saveStatus}`} role="status" aria-live="polite">
        {state.saveStatus === 'saving' ? (
          <span className="spinner small" />
        ) : (
          <Icon name={state.saveStatus === 'error' ? 'alert' : 'check'} size={14} strokeWidth={3} />
        )}
        {SAVE_LABEL[state.saveStatus]}
      </div>
    </>
  );
}
