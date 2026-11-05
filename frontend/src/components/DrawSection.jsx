import { useState } from 'react';
import { api } from '../api.js';
import { MIN_PARTICIPANTS, isValidEmail, plural, sharedEmails } from '../utils.js';
import { Avatar } from './Avatar.jsx';
import { Icon } from './Icon.jsx';
import { Modal } from './Modal.jsx';
import { Section } from './Section.jsx';

function emailCheck(health) {
  if (health.status === 'loading') return { state: 'pending', text: 'Verificando o servidor…' };
  if (health.status === 'offline') {
    return { state: 'error', text: 'Servidor indisponível. Verifique se o backend está rodando.', retry: true };
  }
  const mode = health.email?.mode;
  if (mode === 'unconfigured') {
    return { state: 'error', text: 'Email não configurado: preencha EMAIL_USER e EMAIL_TOKEN no arquivo backend/.env.' };
  }
  if (mode === 'dry-run') {
    return { state: 'warn', text: 'Modo de teste: os emails serão salvos em backend/outbox, sem envio real.' };
  }
  return { state: 'ok', text: 'Servidor de email configurado.' };
}

function validationCheck(validation, enoughPeople) {
  if (!enoughPeople) return { state: 'idle', text: 'As regras serão verificadas assim que houver participantes suficientes.' };
  if (validation.status === 'ok') return { state: 'ok', text: 'Regras válidas: o sorteio é possível.' };
  if (validation.status === 'error') return { state: 'error', text: validation.message };
  return { state: 'pending', text: 'Verificando se o sorteio é possível…' };
}

const STATE_ICON = { ok: 'check', error: 'x', warn: 'alert', pending: null, idle: 'info' };

function Check({ state, text, action }) {
  return (
    <li className={`check ${state}`}>
      <span className="check-icon">
        {state === 'pending' ? <span className="spinner small" /> : <Icon name={STATE_ICON[state]} size={14} strokeWidth={3} />}
      </span>
      <span className="check-text">{text}</span>
      {action}
    </li>
  );
}

export function DrawSection({ participants, rules, event, validation, health, onRetryHealth, lastDraw, setLastDraw }) {
  const [confirming, setConfirming] = useState(false);
  const [confirmingRedo, setConfirmingRedo] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);

  const prepareNewDraw = async () => {
    setConfirmingRedo(false);
    setError(null);
    try {
      await api.clearCurrentDraw();
      setLastDraw(null);
    } catch (err) {
      setError(err.message);
    }
  };

  const missing = Math.max(0, MIN_PARTICIPANTS - participants.length);
  const enoughPeople = missing === 0;
  const email = emailCheck(health);
  const rulesCheck = validationCheck(validation, enoughPeople);
  const canDraw = enoughPeople && validation.status === 'ok' && (email.state === 'ok' || email.state === 'warn');

  const runDraw = async () => {
    setConfirming(false);
    setSending(true);
    setError(null);
    try {
      setLastDraw(await api.draw(participants, rules, event));
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  if (lastDraw) {
    return (
      <Section step={4} title="Sorteio" subtitle="Pronto! Agora é só esperar o grande dia.">
        <DrawResult lastDraw={lastDraw} setLastDraw={setLastDraw} onRedo={() => setConfirmingRedo(true)} />
        {error && (
          <p className="form-error" role="alert">
            <Icon name="alert" size={16} /> {error}
          </p>
        )}
        {confirmingRedo && (
          <Modal
            title="Fazer um novo sorteio?"
            onClose={() => setConfirmingRedo(false)}
            actions={
              <>
                <button className="btn btn-ghost" onClick={() => setConfirmingRedo(false)} data-autofocus>
                  Cancelar
                </button>
                <button className="btn btn-danger" onClick={prepareNewDraw}>
                  Sim, preparar novo sorteio
                </button>
              </>
            }
          >
            <p>
              O resultado atual continuará valendo até você sortear de novo. Se fizer um novo sorteio, todos receberão
              um email novo e o anterior <strong>deixa de valer</strong> — avise o grupo para evitar confusão.
            </p>
          </Modal>
        )}
      </Section>
    );
  }

  return (
    <Section step={4} title="Sorteio" subtitle="Ninguém, nem você, verá o resultado. Cada pessoa descobre pelo email.">
      <ul className="checklist">
        <Check
          state={enoughPeople ? 'ok' : 'error'}
          text={
            enoughPeople
              ? `${plural(participants.length, 'participante cadastrado', 'participantes cadastrados')}.`
              : `Cadastre pelo menos ${MIN_PARTICIPANTS} participantes (falta${missing > 1 ? 'm' : ''} ${missing}).`
          }
        />
        <Check {...rulesCheck} />
        <Check
          {...email}
          action={
            email.retry && (
              <button type="button" className="btn-link" onClick={onRetryHealth}>
                <Icon name="refresh" size={14} /> Tentar de novo
              </button>
            )
          }
        />
      </ul>

      {error && (
        <p className="form-error" role="alert">
          <Icon name="alert" size={16} /> {error}
        </p>
      )}

      <button
        type="button"
        className="btn btn-primary btn-xl"
        disabled={!canDraw || sending}
        onClick={() => setConfirming(true)}
      >
        {sending ? (
          <>
            <span className="spinner" /> Sorteando e enviando emails…
          </>
        ) : (
          <>
            <Icon name="gift" size={22} /> Sortear e enviar emails
          </>
        )}
      </button>

      {confirming && (
        <Modal
          title="Confirmar o sorteio?"
          onClose={() => setConfirming(false)}
          actions={
            <>
              <button className="btn btn-ghost" onClick={() => setConfirming(false)}>
                Revisar
              </button>
              <button className="btn btn-primary" onClick={runDraw} data-autofocus>
                <Icon name="mail" /> Sortear e enviar
              </button>
            </>
          }
        >
          <p>
            Vamos sortear e enviar <strong>{plural(participants.length, 'email')}</strong>, um para cada participante
            {rules.length > 0 && <>, respeitando {plural(rules.length, 'regra')}</>}.
          </p>
          <ul className="confirm-list">
            {participants.map((p) => (
              <li key={p.id}>
                <strong>{p.name}</strong> <span>{p.email}</span>
              </li>
            ))}
          </ul>
          {sharedEmails(participants).size > 0 && (
            <p className="muted">
              📬 Alguns participantes compartilham o mesmo email. Cada pessoa recebe uma mensagem separada, com o
              próprio nome no assunto e no corpo do email.
            </p>
          )}
          <p className="muted">Confira se os emails estão corretos: o resultado só aparece no email de cada pessoa.</p>
        </Modal>
      )}
    </Section>
  );
}

function DrawResult({ lastDraw, setLastDraw, onRedo }) {
  const { results } = lastDraw;
  const sent = results.filter((r) => r.status === 'sent').length;
  const allSent = sent === results.length;
  const when = new Date(lastDraw.createdAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

  const updateResult = (result) =>
    setLastDraw((current) => ({
      ...current,
      results: current.results.map((r) => (r.id === result.id ? result : r)),
    }));

  return (
    <div className="result">
      <div className={`result-banner ${allSent ? 'success' : 'partial'}`}>
        <span className="result-emoji">{allSent ? '🎉' : '⚠️'}</span>
        <div>
          <h3>{allSent ? 'Sorteio realizado!' : 'Sorteio realizado, mas alguns emails falharam'}</h3>
          <p>
            {lastDraw.mode === 'dry-run' ? 'Emails salvos em backend/outbox (modo de teste)' : 'Emails enviados'} para{' '}
            <strong>
              {sent} de {results.length}
            </strong>{' '}
            participantes · {when}
          </p>
        </div>
      </div>

      <ul className="result-list">
        {results.map((result) => (
          <ResultRow key={result.id} drawId={lastDraw.drawId} result={result} onUpdate={updateResult} />
        ))}
      </ul>

      <p className="hint">
        <Icon name="info" size={16} />
        <span>
          Alguém não recebeu? Peça para olhar a caixa de spam ou use “Reenviar”. O reenvio manda o mesmo resultado, sem
          refazer o sorteio — ele fica guardado no banco de dados.
        </span>
      </p>

      <button type="button" className="btn btn-ghost" onClick={onRedo}>
        <Icon name="shuffle" /> Fazer um novo sorteio
      </button>
    </div>
  );
}

function ResultRow({ drawId, result, onUpdate }) {
  const [email, setEmail] = useState(result.email);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [resent, setResent] = useState(false);
  const failed = result.status === 'failed';

  const resend = async () => {
    if (failed && !isValidEmail(email.trim())) {
      setError('Email inválido.');
      return;
    }
    setBusy(true);
    setError(null);
    setResent(false);
    try {
      const { result: updated } = await api.resend(drawId, result.id, failed ? email.trim() : undefined);
      onUpdate(updated);
      if (updated.status === 'sent') setResent(true);
      else setError(updated.error);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className={`result-row ${failed ? 'failed' : ''}`}>
      <Avatar name={result.name} size={36} />
      <div className="participant-info">
        <strong>{result.name}</strong>
        {failed ? (
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-label={`Email de ${result.name}`}
            className="inline-input"
          />
        ) : (
          <span>{result.email}</span>
        )}
        {failed && !error && <small className="error-text">Falhou: {result.error}</small>}
        {error && <small className="error-text">{error}</small>}
      </div>
      <span className={`status ${failed ? 'failed' : 'sent'}`}>
        <Icon name={failed ? 'x' : 'check'} size={14} strokeWidth={3} />
        {failed ? 'Falhou' : resent ? 'Reenviado' : 'Enviado'}
      </span>
      <button type="button" className="btn btn-small btn-ghost" onClick={resend} disabled={busy}>
        {busy ? <span className="spinner small" /> : <Icon name="refresh" size={14} />} Reenviar
      </button>
    </li>
  );
}
