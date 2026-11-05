import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { groupHref } from '../hooks/useRoute.js';
import { Avatar } from './Avatar.jsx';
import { Icon } from './Icon.jsx';
import { Modal } from './Modal.jsx';

/**
 * Área secreta (debug): só tem link depois do sorteio (seção 5). Serve para conferir
 * um sorteio quando algo dá errado, revelando UM par de cada vez, sempre com confirmação.
 */

const HIDE_AFTER_SECONDS = 15;

const SEND_STATUS = {
  sent: { label: 'Enviado', className: 'sent' },
  failed: { label: 'Falhou', className: 'failed' },
  pending: { label: 'Pendente', className: 'pending' },
};

function Integrity({ check }) {
  if (check.ok) {
    return (
      <p className="integrity ok">
        <Icon name="check" size={16} strokeWidth={3} />
        <span>
          <strong>Sorteio íntegro:</strong> cada pessoa tirou exatamente uma, foi tirada por exatamente uma, ninguém
          tirou a si mesmo e todos formam um único ciclo.
        </span>
      </p>
    );
  }
  return (
    <div className="integrity error" role="alert">
      <Icon name="alert" size={16} />
      <div>
        <strong>Problemas encontrados neste sorteio:</strong>
        <ul>
          {check.problems.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function SecretRow({ result, revealed, loading, onReveal, onHide }) {
  const send = SEND_STATUS[result.status] ?? SEND_STATUS.pending;
  return (
    <li className="secret-row">
      <span className="secret-person">
        <Avatar name={result.name} size={32} />
        <span className="participant-info">
          <strong>{result.name}</strong>
          <span>{result.email}</span>
        </span>
      </span>
      <span className={`status ${send.className}`}>{send.label}</span>
      <span className="secret-actions">
        <button
          type="button"
          className="btn btn-ghost btn-small"
          disabled={loading}
          title={`Ver quem ${result.name} tirou`}
          aria-label={`Ver quem ${result.name} tirou`}
          onClick={() => onReveal('receiver')}
        >
          <Icon name="gift" size={14} /> Ver amigo oculto
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-small"
          disabled={loading}
          title={`Ver quem tirou ${result.name}`}
          aria-label={`Ver quem tirou ${result.name}`}
          onClick={() => onReveal('giver')}
        >
          <Icon name="users" size={14} /> Ver quem tirou
        </button>
      </span>
      {revealed && (
        <div className="secret-reveal" role="status">
          <span>
            <strong>{revealed.giver.name}</strong> tirou <strong>{revealed.receiver.name}</strong>
          </span>
          <small>Some sozinho em {HIDE_AFTER_SECONDS} s.</small>
          <button type="button" className="btn-link" onClick={onHide}>
            <Icon name="x" size={14} /> Esconder
          </button>
        </div>
      )}
    </li>
  );
}

function DrawCard({ draw, revealed, loadingId, onReveal, onHide }) {
  const when = new Date(draw.createdAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  return (
    <section className="card">
      <header className="card-header">
        <div className="card-heading">
          {/* Cada amigo oculto tem um único sorteio; "anterior" só aparece em dados de versões antigas do app. */}
          <h2>{draw.current ? 'Sorteio' : 'Sorteio anterior'}</h2>
          <p>
            Feito em {when} · {draw.mode === 'dry-run' ? 'modo de teste' : 'enviado por email'} · {draw.sent} de{' '}
            {draw.results.length} emails enviados
          </p>
        </div>
      </header>
      <Integrity check={draw.check} />
      <ul className="secret-list">
        {draw.results.map((result) => {
          const rowKey = `${draw.drawId}:${result.id}`;
          return (
            <SecretRow
              key={result.id}
              result={result}
              revealed={revealed?.rowKey === rowKey ? revealed : null}
              loading={loadingId === rowKey}
              onReveal={(direction) => onReveal({ drawId: draw.drawId, person: result, direction })}
              onHide={onHide}
            />
          );
        })}
      </ul>
    </section>
  );
}

export function SecretPage({ groupId }) {
  const [loadStatus, setLoadStatus] = useState('loading'); // loading | ready | notfound | error
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [revealed, setRevealed] = useState(null);
  const [loadingId, setLoadingId] = useState(null);
  const [confirming, setConfirming] = useState(null); // { drawId, person, direction } aguardando confirmação

  const load = useCallback(async () => {
    setLoadStatus('loading');
    setError(null);
    try {
      setData(await api.secretDraws(groupId));
      setLoadStatus('ready');
    } catch (err) {
      setLoadStatus(err.status === 404 ? 'notfound' : 'error');
      setError(err.message);
    }
  }, [groupId]);

  useEffect(() => {
    load();
  }, [load]);

  // O par revelado some sozinho depois de alguns segundos.
  useEffect(() => {
    if (!revealed) return undefined;
    const timer = setTimeout(() => setRevealed(null), HIDE_AFTER_SECONDS * 1000);
    return () => clearTimeout(timer);
  }, [revealed]);

  const reveal = async ({ drawId, person, direction }) => {
    setConfirming(null);
    const rowKey = `${drawId}:${person.id}`;
    setRevealed(null);
    setLoadingId(rowKey);
    setError(null);
    try {
      const pair = await api.reveal(drawId, person.id, direction);
      setRevealed({ rowKey, ...pair });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingId(null);
    }
  };

  const title = data ? data.event.name || 'Amigo oculto sem nome' : null;

  return (
    <>
      <section className="card group-banner secret-banner">
        <a className="btn-link" href={groupHref(groupId)}>
          <Icon name="back" size={16} /> Voltar para o amigo oculto
        </a>
        <div className="group-banner-title">
          <h2>🔒 Área secreta{title && ` · ${title}`}</h2>
        </div>
        <p className="muted">
          Use só para resolver problemas. Aqui dá para ver quem tirou quem, <strong>uma pessoa de cada vez</strong>, e
          cada resultado some sozinho depois de {HIDE_AFTER_SECONDS} segundos. Cuidado com quem está olhando a tela. 👀
        </p>
      </section>

      {loadStatus === 'loading' && (
        <section className="card loading-card">
          <span className="spinner small" /> Abrindo a área secreta…
        </section>
      )}

      {loadStatus === 'notfound' && (
        <section className="card offline-card">
          <span className="empty-icon">🔍</span>
          <h2>Amigo oculto não encontrado</h2>
          <p>Ele pode ter sido apagado.</p>
        </section>
      )}

      {loadStatus === 'error' && (
        <section className="card offline-card">
          <span className="empty-icon">🔌</span>
          <h2>Não foi possível abrir a área secreta</h2>
          <p>{error}</p>
          <button type="button" className="btn btn-primary" onClick={load}>
            <Icon name="refresh" /> Tentar de novo
          </button>
        </section>
      )}

      {loadStatus === 'ready' && (
        <>
          {error && (
            <p className="form-error" role="alert">
              <Icon name="alert" size={16} /> {error}
            </p>
          )}
          {data.draws.length === 0 ? (
            <section className="card">
              <div className="empty">
                <span className="empty-icon">🎲</span>
                <p>Nenhum sorteio feito ainda.</p>
                <small>Depois do sorteio, quem tirou quem fica guardado aqui.</small>
              </div>
            </section>
          ) : (
            data.draws.map((draw) => (
              <DrawCard
                key={draw.drawId}
                draw={draw}
                revealed={revealed}
                loadingId={loadingId}
                onReveal={(request) => {
                  setRevealed(null);
                  setConfirming(request);
                }}
                onHide={() => setRevealed(null)}
              />
            ))
          )}
        </>
      )}

      {confirming && (
        <Modal
          title={
            confirming.direction === 'receiver'
              ? `Revelar quem ${confirming.person.name} tirou?`
              : `Revelar quem tirou ${confirming.person.name}?`
          }
          onClose={() => setConfirming(null)}
          actions={
            <>
              <button type="button" className="btn btn-ghost" onClick={() => setConfirming(null)} data-autofocus>
                Cancelar
              </button>
              <button type="button" className="btn btn-danger" onClick={() => reveal(confirming)}>
                <Icon name="eye" /> Sim, revelar
              </button>
            </>
          }
        >
          <p>
            O resultado vai aparecer na tela por {HIDE_AFTER_SECONDS} segundos. Antes de continuar, confira se ninguém
            está olhando — principalmente <strong>{confirming.person.name}</strong>. 👀
          </p>
        </Modal>
      )}
    </>
  );
}
