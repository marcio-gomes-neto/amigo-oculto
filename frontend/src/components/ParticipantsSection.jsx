import { useRef, useState } from 'react';
import { cleanName, participantError, parseImportList, plural, sharedEmails, uid } from '../utils.js';
import { Avatar } from './Avatar.jsx';
import { Icon } from './Icon.jsx';
import { Modal } from './Modal.jsx';
import { Section } from './Section.jsx';

export function ParticipantsSection({ participants, setParticipants, onRemove, onClear }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState(null);
  const [showImport, setShowImport] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const nameRef = useRef(null);

  const handleSubmit = (event) => {
    event.preventDefault();
    const data = { name: cleanName(name), email: email.trim() };
    const problem = participantError(data, participants);
    if (problem) {
      setError(problem);
      return;
    }
    setParticipants((list) => [...list, { id: uid(), ...data }]);
    setName('');
    setEmail('');
    setError(null);
    nameRef.current?.focus();
  };

  const shared = sharedEmails(participants);

  const updateParticipant = (id, data) => {
    setParticipants((list) => list.map((p) => (p.id === id ? { ...p, ...data } : p)));
  };

  return (
    <Section
      step={1}
      title="Participantes"
      subtitle="Quem vai participar? Cada pessoa recebe o resultado no próprio email."
      badge={plural(participants.length, 'pessoa')}
    >
      <form className="add-form" onSubmit={handleSubmit} noValidate>
        <label className="field">
          <span>Nome</span>
          <input
            ref={nameRef}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError(null);
            }}
            placeholder="Ex.: Ana Souza"
            autoComplete="off"
            maxLength={60}
          />
        </label>
        <label className="field">
          <span>Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setError(null);
            }}
            placeholder="ana@email.com"
            autoComplete="off"
            maxLength={254}
          />
        </label>
        <button className="btn btn-primary add-btn" type="submit">
          <Icon name="plus" /> Adicionar
        </button>
      </form>
      {error && (
        <p className="form-error" role="alert">
          <Icon name="alert" size={16} /> {error}
        </p>
      )}

      <div className="toolbar">
        <button type="button" className="btn-link" onClick={() => setShowImport((v) => !v)}>
          <Icon name="list" size={16} /> {showImport ? 'Fechar importação' : 'Colar uma lista de participantes'}
        </button>
        {participants.length > 0 && (
          <button type="button" className="btn-link danger" onClick={() => setConfirmClear(true)}>
            <Icon name="trash" size={16} /> Remover todos
          </button>
        )}
      </div>

      {showImport && (
        <ImportPanel
          participants={participants}
          onImport={(added) => setParticipants((list) => [...list, ...added])}
        />
      )}

      {participants.length === 0 ? (
        <div className="empty">
          <span className="empty-icon">🎄</span>
          <p>Nenhum participante ainda.</p>
          <small>Adicione pelo menos 3 pessoas para fazer o sorteio.</small>
        </div>
      ) : (
        <ul className="participant-list">
          {participants.map((participant) => (
            <ParticipantRow
              key={participant.id}
              participant={participant}
              participants={participants}
              sharedEmail={shared.has(participant.email.toLowerCase())}
              onSave={(data) => updateParticipant(participant.id, data)}
              onRemove={() => onRemove(participant.id)}
            />
          ))}
        </ul>
      )}

      {confirmClear && (
        <Modal
          title="Remover todos os participantes?"
          onClose={() => setConfirmClear(false)}
          actions={
            <>
              <button className="btn btn-ghost" onClick={() => setConfirmClear(false)} data-autofocus>
                Cancelar
              </button>
              <button
                className="btn btn-danger"
                onClick={() => {
                  onClear();
                  setConfirmClear(false);
                }}
              >
                Remover todos
              </button>
            </>
          }
        >
          <p>
            Os {participants.length} participantes e todas as regras serão apagados. Essa ação não pode ser desfeita.
          </p>
        </Modal>
      )}
    </Section>
  );
}

function ParticipantRow({ participant, participants, sharedEmail, onSave, onRemove }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(participant.name);
  const [email, setEmail] = useState(participant.email);
  const [error, setError] = useState(null);

  const startEditing = () => {
    setName(participant.name);
    setEmail(participant.email);
    setError(null);
    setEditing(true);
  };

  const save = (event) => {
    event.preventDefault();
    const data = { name: cleanName(name), email: email.trim() };
    const problem = participantError(data, participants, participant.id);
    if (problem) {
      setError(problem);
      return;
    }
    onSave(data);
    setEditing(false);
  };

  if (editing) {
    return (
      <li className="participant editing">
        <form onSubmit={save} className="edit-form" noValidate>
          <input value={name} onChange={(e) => setName(e.target.value)} aria-label="Nome" maxLength={60} autoFocus />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-label="Email"
            maxLength={254}
          />
          <div className="row-actions">
            <button type="submit" className="icon-btn success" title="Salvar" aria-label="Salvar">
              <Icon name="check" />
            </button>
            <button
              type="button"
              className="icon-btn"
              title="Cancelar"
              aria-label="Cancelar"
              onClick={() => setEditing(false)}
            >
              <Icon name="x" />
            </button>
          </div>
        </form>
        {error && <p className="form-error small">{error}</p>}
      </li>
    );
  }

  return (
    <li className="participant">
      <Avatar name={participant.name} />
      <div className="participant-info">
        <strong>{participant.name}</strong>
        <span className="participant-email">
          <span className="email-text" title={participant.email}>
            {participant.email}
          </span>
          {sharedEmail && (
            <span
              className="shared-tag"
              title="Mais de um participante usa este email. Cada pessoa recebe um email separado, com o próprio nome."
            >
              <Icon name="users" size={12} /> compartilhado
            </span>
          )}
        </span>
      </div>
      <div className="row-actions">
        <button
          type="button"
          className="icon-btn"
          onClick={startEditing}
          title="Editar"
          aria-label={`Editar ${participant.name}`}
        >
          <Icon name="edit" />
        </button>
        <button
          type="button"
          className="icon-btn danger"
          onClick={onRemove}
          title="Remover"
          aria-label={`Remover ${participant.name}`}
        >
          <Icon name="trash" />
        </button>
      </div>
    </li>
  );
}

function ImportPanel({ participants, onImport }) {
  const [text, setText] = useState('');
  const [report, setReport] = useState(null);

  const handleImport = () => {
    const added = [];
    const skipped = [];
    for (const entry of parseImportList(text)) {
      if (entry.error) {
        skipped.push(`${entry.line} (${entry.error})`);
        continue;
      }
      const problem = participantError(entry, [...participants, ...added]);
      if (problem) {
        skipped.push(`${entry.line} (${problem})`);
        continue;
      }
      added.push({ id: uid(), name: entry.name, email: entry.email });
    }
    if (added.length) onImport(added);
    setReport({ added: added.length, skipped });
    setText(skipped.length ? text : '');
  };

  return (
    <div className="import-panel">
      <label className="field">
        <span>Uma pessoa por linha, no formato “Nome, email”</span>
        <textarea
          rows={5}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={'Ana Souza, ana@email.com\nBruno Lima; bruno@email.com\nCarla Dias <carla@email.com>'}
        />
      </label>
      <div className="import-actions">
        <button type="button" className="btn btn-secondary" onClick={handleImport} disabled={!text.trim()}>
          <Icon name="plus" /> Importar lista
        </button>
        {report && (
          <span className="import-report">
            {plural(report.added, 'pessoa adicionada', 'pessoas adicionadas')}
            {report.skipped.length > 0 && `, ${plural(report.skipped.length, 'linha ignorada', 'linhas ignoradas')}`}
          </span>
        )}
      </div>
      {report?.skipped.length > 0 && (
        <ul className="import-skipped">
          {report.skipped.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
