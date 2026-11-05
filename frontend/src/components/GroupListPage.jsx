import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { whenSaved, withRetry } from '../hooks/useAppState.js';
import { groupHref, navigate } from '../hooks/useRoute.js';
import { MIN_PARTICIPANTS, STATUS_LABEL, daysUntil, formatBudget, formatDate, plural } from '../utils.js';
import { Icon } from './Icon.jsx';
import { Modal } from './Modal.jsx';

const FILTERS = [
  { key: 'all', label: 'Todos' },
  { key: 'draft', label: 'Não sorteados' },
  { key: 'drawn', label: 'Sorteados' },
  { key: 'finished', label: 'Encerrados' },
];

const STATUS_ORDER = { draft: 0, drawn: 1, finished: 2 };
const STATUS_EMOJI = { draft: '📝', drawn: '🎁', finished: '✅' };

/** Não sorteados, depois sorteados, depois encerrados. Dentro de cada um, o evento mais próximo primeiro. */
function compareGroups(a, b) {
  if (a.status !== b.status) return STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
  const dateA = a.event.date;
  const dateB = b.event.date;
  if (dateA !== dateB) {
    if (!dateA) return 1;
    if (!dateB) return -1;
    return a.status === 'finished' ? dateB.localeCompare(dateA) : dateA.localeCompare(dateB);
  }
  return b.createdAt.localeCompare(a.createdAt);
}

const groupName = (group) => group.event.name || 'Amigo oculto sem nome';

function whenText({ event, status }) {
  if (!event.date) return 'Sem data definida';
  const date = formatDate(event.date);
  const days = daysUntil(event.date);
  if (days === null || status === 'finished') return date;
  if (days === 0) return `${date} · hoje`;
  if (days === 1) return `${date} · amanhã`;
  if (days > 1) return `${date} · em ${days} dias`;
  return `${date} · a data já passou`;
}

function DrawSummary({ group }) {
  if (!group.draw) {
    const missing = MIN_PARTICIPANTS - group.participants;
    return (
      <span className="group-progress">
        {missing > 0 ? `Faltam ${plural(missing, 'participante')} para sortear` : 'Pronto para sortear'}
      </span>
    );
  }
  const when = new Date(group.draw.createdAt).toLocaleDateString('pt-BR');
  return (
    <span className="group-progress">
      Sorteado em {when} · {group.draw.sent} de {plural(group.draw.total, 'email enviado', 'emails enviados')}
      {group.draw.failed > 0 && <strong className="error-text"> · {group.draw.failed} com falha</strong>}
    </span>
  );
}

function GroupItem({ group, onDelete }) {
  const name = groupName(group);
  return (
    <li className={`group-item ${group.status}`}>
      <a className="group-link" href={groupHref(group.id)}>
        <span className="group-emoji" aria-hidden="true">
          {STATUS_EMOJI[group.status]}
        </span>
        <span className="group-main">
          <span className="group-title-row">
            <strong className="group-title">{name}</strong>
            <span className={`group-status ${group.status}`}>{STATUS_LABEL[group.status]}</span>
          </span>
          <span className="group-meta">
            <span>
              <Icon name="calendar" size={14} /> {whenText(group)}
            </span>
            <span>
              <Icon name="users" size={14} /> {plural(group.participants, 'participante')}
            </span>
            {group.rules > 0 && (
              <span>
                <Icon name="ban" size={14} /> {plural(group.rules, 'regra')}
              </span>
            )}
            {group.event.budget && <span>💰 {formatBudget(group.event.budget)}</span>}
          </span>
          <DrawSummary group={group} />
        </span>
        <Icon name="chevron" className="group-chevron" />
      </a>
      <button
        type="button"
        className="icon-btn danger"
        title="Apagar amigo oculto"
        aria-label={`Apagar ${name}`}
        onClick={onDelete}
      >
        <Icon name="trash" />
      </button>
    </li>
  );
}

function CreateGroupModal({ onClose }) {
  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Dê um nome para o amigo oculto.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const group = await api.createGroup({ name: trimmed, date });
      navigate(groupHref(group.id));
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <Modal
      title="Novo amigo oculto"
      onClose={onClose}
      actions={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" form="create-group" className="btn btn-primary" disabled={saving}>
            {saving ? 'Criando…' : 'Criar e abrir'}
          </button>
        </>
      }
    >
      <form id="create-group" className="create-group-form" onSubmit={handleSubmit} noValidate>
        <label className="field">
          <span>Nome</span>
          <input
            data-autofocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Amigo Oculto da Família"
            maxLength={80}
          />
        </label>
        <label className="field">
          <span>Data do evento (opcional)</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <p className="muted">O nome aparece no email de cada participante. Dá para mudar tudo depois.</p>
        {error && (
          <p className="form-error" role="alert">
            <Icon name="alert" size={16} /> {error}
          </p>
        )}
      </form>
    </Modal>
  );
}

function DeleteGroupModal({ group, onClose, onDeleted }) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(null);

  const confirmDelete = async () => {
    setDeleting(true);
    setError(null);
    try {
      await api.deleteGroup(group.id);
      onDeleted();
    } catch (err) {
      if (err.status === 404) return onDeleted(); // já tinha sido apagado
      setError(err.message);
      setDeleting(false);
    }
  };

  return (
    <Modal
      title="Apagar amigo oculto?"
      onClose={onClose}
      actions={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose} data-autofocus>
            Cancelar
          </button>
          <button type="button" className="btn btn-danger" onClick={confirmDelete} disabled={deleting}>
            {deleting ? 'Apagando…' : 'Sim, apagar'}
          </button>
        </>
      }
    >
      <p>
        Isso apaga <strong>{groupName(group)}</strong> com {plural(group.participants, 'participante')}, as regras e o
        resultado do sorteio. Não dá para desfazer.
      </p>
      {group.draw && <p className="muted">Os emails já enviados continuam na caixa de entrada de cada participante.</p>}
      {error && (
        <p className="form-error" role="alert">
          <Icon name="alert" size={16} /> {error}
        </p>
      )}
    </Modal>
  );
}

export function GroupListPage() {
  const [loadStatus, setLoadStatus] = useState('loading'); // loading | ready | error
  const [groups, setGroups] = useState([]);
  const [filter, setFilter] = useState('all');
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(null);

  const load = useCallback(async () => {
    setLoadStatus('loading');
    try {
      await whenSaved(); // ao voltar de um amigo oculto, espera o último salvamento para a lista vir atualizada
      const data = await withRetry(api.listGroups);
      setGroups(data.groups);
      setLoadStatus('ready');
    } catch {
      setLoadStatus('error');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loadStatus === 'loading') {
    return (
      <section className="card loading-card">
        <span className="spinner small" /> Carregando seus amigos ocultos…
      </section>
    );
  }

  if (loadStatus === 'error') {
    return (
      <section className="card offline-card">
        <span className="empty-icon">🔌</span>
        <h2>Não foi possível conectar ao servidor</h2>
        <p>Verifique se o backend está rodando (npm run dev) e tente de novo.</p>
        <button type="button" className="btn btn-primary" onClick={load}>
          <Icon name="refresh" /> Tentar de novo
        </button>
      </section>
    );
  }

  const counts = { all: groups.length, draft: 0, drawn: 0, finished: 0 };
  for (const group of groups) counts[group.status] += 1;
  const visible = groups.filter((g) => filter === 'all' || g.status === filter).sort(compareGroups);

  return (
    <>
      <section className="card">
        <header className="card-header page-header">
          <div className="card-heading">
            <h2>Seus amigos ocultos</h2>
            <p>Crie um para cada turma (família, trabalho, amigos) e acompanhe o status de cada um.</p>
          </div>
          <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
            <Icon name="plus" /> Novo amigo oculto
          </button>
        </header>

        {groups.length === 0 ? (
          <div className="empty">
            <span className="empty-icon">🎄</span>
            <p>Nenhum amigo oculto ainda.</p>
            <small>Crie o primeiro para cadastrar a turma e fazer o sorteio.</small>
          </div>
        ) : (
          <>
            <div className="filter-tabs" role="group" aria-label="Filtrar por status">
              {FILTERS.map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  className={filter === key ? 'active' : ''}
                  aria-pressed={filter === key}
                  onClick={() => setFilter(key)}
                >
                  {label} <span className="filter-count">{counts[key]}</span>
                </button>
              ))}
            </div>

            {visible.length === 0 ? (
              <p className="muted filter-empty">Nenhum amigo oculto com esse status.</p>
            ) : (
              <ul className="group-list">
                {visible.map((group) => (
                  <GroupItem key={group.id} group={group} onDelete={() => setDeleting(group)} />
                ))}
              </ul>
            )}
          </>
        )}
      </section>

      {creating && <CreateGroupModal onClose={() => setCreating(false)} />}
      {deleting && (
        <DeleteGroupModal
          group={deleting}
          onClose={() => setDeleting(null)}
          onDeleted={() => {
            setGroups((list) => list.filter((g) => g.id !== deleting.id));
            setDeleting(null);
          }}
        />
      )}
    </>
  );
}
