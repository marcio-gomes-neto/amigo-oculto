import { MIN_PARTICIPANTS, RULE_TYPES } from './draw.js';

export const MAX_PARTICIPANTS = 200;
const MAX_RULES = 2000;
const EMAIL_REGEX = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

const badRequest = (message) => new HttpError(400, message);

/** Normaliza para comparar nomes/emails sem diferenciar maiúsculas e acentos. */
export function normalizeKey(value) {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().toLowerCase();
}

export function isValidEmail(email) {
  return typeof email === 'string' && email.length <= 254 && EMAIL_REGEX.test(email);
}

function optionalText(value, field, maxLength) {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') throw badRequest(`O campo "${field}" deve ser um texto.`);
  const text = value.trim();
  if (text.length > maxLength) throw badRequest(`O campo "${field}" deve ter no máximo ${maxLength} caracteres.`);
  return text;
}

function parseParticipants(raw, { min = MIN_PARTICIPANTS } = {}) {
  if (!Array.isArray(raw)) throw badRequest('A lista de participantes é obrigatória.');
  if (raw.length < min) {
    throw badRequest(`São necessários pelo menos ${MIN_PARTICIPANTS} participantes para o sorteio.`);
  }
  if (raw.length > MAX_PARTICIPANTS) throw badRequest(`O limite é de ${MAX_PARTICIPANTS} participantes.`);

  // Nomes precisam ser únicos (são eles que identificam quem tirou quem).
  // Emails podem se repetir: ex.: um casal ou crianças que usam o email dos pais.
  const ids = new Set();
  const names = new Map();

  return raw.map((item, index) => {
    const position = index + 1;
    if (!item || typeof item !== 'object') throw badRequest(`Participante #${position} é inválido.`);

    const id = typeof item.id === 'string' ? item.id.trim() : '';
    if (!id || id.length > 64) throw badRequest(`Participante #${position} está sem identificador válido.`);
    if (ids.has(id)) throw badRequest(`Identificador de participante duplicado: ${id}.`);
    ids.add(id);

    const name = typeof item.name === 'string' ? item.name.trim().replace(/\s+/g, ' ') : '';
    if (!name) throw badRequest(`Participante #${position} está sem nome.`);
    if (name.length > 60) throw badRequest(`O nome "${name}" é muito longo (máximo de 60 caracteres).`);

    const email = typeof item.email === 'string' ? item.email.trim() : '';
    if (!isValidEmail(email)) throw badRequest(`O email de ${name} é inválido.`);

    const nameKey = normalizeKey(name);
    if (names.has(nameKey)) {
      throw badRequest(
        `Existem dois participantes chamados "${name}". Use sobrenome ou apelido para diferenciar e evitar confusão.`,
      );
    }
    names.set(nameKey, name);

    return { id, name, email };
  });
}

function parseRules(raw, { participantIds, keepIds = false } = {}) {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) throw badRequest('As regras devem ser uma lista.');
  if (raw.length > MAX_RULES) throw badRequest(`O limite é de ${MAX_RULES} regras.`);

  const ids = new Set();
  return raw.map((rule, index) => {
    const position = index + 1;
    if (!rule || typeof rule !== 'object') throw badRequest(`Regra #${position} é inválida.`);
    const { type, from, to } = rule;
    if (!RULE_TYPES.includes(type)) throw badRequest(`Regra #${position} tem um tipo inválido.`);
    if (typeof from !== 'string' || typeof to !== 'string') {
      throw badRequest(`Regra #${position} precisa indicar quem tira e quem é tirado.`);
    }
    if (participantIds && (!participantIds.has(from) || !participantIds.has(to))) {
      throw badRequest(`Regra #${position} faz referência a um participante que não existe.`);
    }
    if (from === to) throw badRequest(`Regra #${position} envolve a mesma pessoa dos dois lados.`);
    if (!keepIds) return { type, from, to };

    const id = typeof rule.id === 'string' && rule.id.trim() ? rule.id.trim() : null;
    if (!id || id.length > 64 || ids.has(id)) throw badRequest(`Regra #${position} está sem identificador válido.`);
    ids.add(id);
    return { id, type, from, to };
  });
}

export function parseEvent(raw) {
  if (raw === undefined || raw === null) return {};
  if (typeof raw !== 'object' || Array.isArray(raw)) throw badRequest('Os detalhes do evento são inválidos.');
  return {
    name: optionalText(raw.name, 'nome do evento', 80),
    date: optionalText(raw.date, 'data', 40),
    budget: optionalText(raw.budget, 'valor sugerido', 40),
    message: optionalText(raw.message, 'mensagem', 600),
  };
}

/** Valida o corpo de uma requisição de sorteio. */
export function parseDrawPayload(body) {
  if (!body || typeof body !== 'object') throw badRequest('Corpo da requisição inválido.');
  return {
    participants: parseParticipants(body.participants),
    rules: parseRules(body.rules),
    event: parseEvent(body.event),
  };
}

/** Valida o estado salvo pelo app (lista em construção: pode ter menos de 3 pessoas). */
export function parseStatePayload(body) {
  if (!body || typeof body !== 'object') throw badRequest('Corpo da requisição inválido.');
  const participants = parseParticipants(body.participants ?? [], { min: 0 });
  const participantIds = new Set(participants.map((p) => p.id));
  return {
    participants,
    rules: parseRules(body.rules, { participantIds, keepIds: true }),
    event: parseEvent(body.event),
  };
}
