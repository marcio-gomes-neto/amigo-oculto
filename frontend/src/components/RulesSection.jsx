import { useState } from 'react';
import { plural, uid } from '../utils.js';
import { Avatar } from './Avatar.jsx';
import { Icon } from './Icon.jsx';
import { Section } from './Section.jsx';

const TYPES = {
  block: { label: 'não pode tirar', icon: 'ban', className: 'block' },
  force: { label: 'deve tirar', icon: 'target', className: 'force' },
};

/** Verifica conflitos óbvios antes de adicionar a regra. Retorna uma mensagem ou null. */
function ruleError({ type, from, to }, rules, nameOf) {
  if (!from || !to) return 'Escolha as duas pessoas da regra.';
  if (from === to) return 'Escolha duas pessoas diferentes.';
  const same = rules.find((r) => r.from === from && r.to === to);
  if (same?.type === type) return 'Essa regra já existe.';
  if (same) {
    return `Já existe uma regra dizendo que ${nameOf(from)} ${TYPES[same.type].label} ${nameOf(to)}. Remova-a primeiro.`;
  }
  if (type === 'force') {
    const existingTarget = rules.find((r) => r.type === 'force' && r.from === from);
    if (existingTarget) return `${nameOf(from)} já deve tirar ${nameOf(existingTarget.to)}. Cada pessoa só pode ter uma regra obrigatória.`;
    const existingGiver = rules.find((r) => r.type === 'force' && r.to === to);
    if (existingGiver) return `${nameOf(existingGiver.from)} já deve tirar ${nameOf(to)}. Uma pessoa só pode ser tirada por alguém.`;
  }
  return null;
}

export function RulesSection({ participants, rules, setRules }) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [type, setType] = useState('block');
  const [error, setError] = useState(null);

  const byId = new Map(participants.map((p) => [p.id, p]));
  const nameOf = (id) => byId.get(id)?.name ?? '?';
  const disabled = participants.length < 2;
  // Ignora seleções de participantes que já foram removidos.
  const fromId = byId.has(from) ? from : '';
  const toId = byId.has(to) && to !== fromId ? to : '';

  const handleSubmit = (event) => {
    event.preventDefault();
    const rule = { type, from: fromId, to: toId };
    const problem = ruleError(rule, rules, nameOf);
    if (problem) {
      setError(problem);
      return;
    }
    setRules((list) => [...list, { id: uid(), ...rule }]);
    setError(null);
    setTo('');
  };

  const blocks = rules.filter((r) => r.type === 'block');
  const forced = rules.filter((r) => r.type === 'force');

  return (
    <Section
      step={2}
      title="Regras"
      optional
      subtitle="Evite que alguém tire uma pessoa específica, ou defina quem deve tirar quem."
      badge={plural(rules.length, 'regra')}
    >
      <form className={`rule-builder ${disabled ? 'is-disabled' : ''}`} onSubmit={handleSubmit}>
        <select
          value={fromId}
          onChange={(e) => setFrom(e.target.value)}
          disabled={disabled}
          aria-label="Quem tira"
        >
          <option value="">Quem…</option>
          {participants.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>

        <div className="segmented" role="radiogroup" aria-label="Tipo de regra">
          {Object.entries(TYPES).map(([key, info]) => (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={type === key}
              className={`${info.className} ${type === key ? 'active' : ''}`}
              onClick={() => setType(key)}
              disabled={disabled}
            >
              <Icon name={info.icon} size={16} /> {info.label}
            </button>
          ))}
        </div>

        <select value={toId} onChange={(e) => setTo(e.target.value)} disabled={disabled} aria-label="Quem é tirado">
          <option value="">…quem</option>
          {participants
            .filter((p) => p.id !== fromId)
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
        </select>

        <button className="btn btn-primary" type="submit" disabled={disabled}>
          <Icon name="plus" /> Adicionar
        </button>
      </form>

      {error && (
        <p className="form-error" role="alert">
          <Icon name="alert" size={16} /> {error}
        </p>
      )}

      <p className="hint">
        <Icon name="info" size={16} />
        <span>
          As regras são de <strong>mão única</strong>: se Ana <em>não pode tirar</em> Bruno, Bruno ainda pode tirar Ana.
          {disabled && ' Cadastre participantes para criar regras.'}
        </span>
      </p>

      {rules.length > 0 && (
        <div className="rule-groups">
          <RuleGroup title="Bloqueios" type="block" rules={blocks} byId={byId} setRules={setRules} />
          <RuleGroup title="Obrigatórias" type="force" rules={forced} byId={byId} setRules={setRules} />
        </div>
      )}
    </Section>
  );
}

function RuleGroup({ title, type, rules, byId, setRules }) {
  if (rules.length === 0) return null;
  const info = TYPES[type];
  return (
    <div className="rule-group">
      <h3 className={info.className}>
        <Icon name={info.icon} size={16} /> {title}
      </h3>
      <ul className="rule-list">
        {rules.map((rule) => {
          const giver = byId.get(rule.from);
          const receiver = byId.get(rule.to);
          if (!giver || !receiver) return null;
          return (
            <li key={rule.id} className={`rule ${info.className}`}>
              <span className="rule-person">
                <Avatar name={giver.name} size={28} />
                {giver.name}
              </span>
              <span className={`rule-chip ${info.className}`}>
                <Icon name={info.icon} size={14} /> {info.label}
              </span>
              <span className="rule-person">
                <Avatar name={receiver.name} size={28} />
                {receiver.name}
              </span>
              <button
                type="button"
                className="icon-btn danger"
                title="Remover regra"
                aria-label={`Remover regra: ${giver.name} ${info.label} ${receiver.name}`}
                onClick={() => setRules((list) => list.filter((r) => r.id !== rule.id))}
              >
                <Icon name="x" />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
