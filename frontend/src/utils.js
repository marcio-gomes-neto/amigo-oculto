export const MIN_PARTICIPANTS = 3;

const EMAIL_REGEX = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

export const isValidEmail = (email) => EMAIL_REGEX.test(email);

/** Compara nomes sem diferenciar maiúsculas e acentos. */
export const normalizeKey = (value) =>
  value.normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().toLowerCase();

export const cleanName = (value) => value.trim().replace(/\s+/g, ' ');

export const uid = () =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export function initials(name) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

const AVATAR_COLORS = ['#c8102e', '#1b7f5b', '#d9822b', '#6c4ab6', '#2a7ab0', '#b83280', '#2f855a', '#c05621'];

export function avatarColor(name) {
  let hash = 0;
  for (const char of normalizeKey(name)) hash = (hash * 31 + char.codePointAt(0)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

/**
 * Verifica se um participante pode ser adicionado/editado.
 * Retorna uma mensagem de erro ou null.
 *
 * O nome precisa ser único; o email pode se repetir (ex.: crianças que usam o
 * email dos pais) — cada pessoa recebe um email separado, com o próprio nome.
 */
export function participantError({ name, email }, participants, ignoreId) {
  if (!name) return 'Informe o nome do participante.';
  if (name.length > 60) return 'O nome deve ter no máximo 60 caracteres.';
  if (!isValidEmail(email)) return 'Informe um email válido.';
  const others = participants.filter((p) => p.id !== ignoreId);
  if (others.some((p) => normalizeKey(p.name) === normalizeKey(name))) {
    return `Já existe alguém chamado "${name}". Use sobrenome ou apelido para não haver confusão.`;
  }
  return null;
}

/** Emails (em minúsculas) usados por mais de um participante. */
export function sharedEmails(participants) {
  const count = new Map();
  for (const { email } of participants) {
    const key = email.toLowerCase();
    count.set(key, (count.get(key) ?? 0) + 1);
  }
  return new Set([...count].filter(([, n]) => n > 1).map(([email]) => email));
}

/**
 * Interpreta uma lista colada, uma pessoa por linha. Aceita:
 *   Ana Souza, ana@email.com
 *   Ana Souza; ana@email.com
 *   Ana Souza <ana@email.com>
 *   Ana Souza	ana@email.com   (copiado de planilha)
 */
export function parseImportList(text) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return lines.map((line) => {
    const match = line.match(/[^\s<>,;]+@[^\s<>,;]+\.[^\s<>,;]+/);
    if (!match) return { line, error: 'email não encontrado' };
    const email = match[0];
    const name = cleanName(line.replace(match[0], '').replace(/[<>,;\t|]+/g, ' ').replace(/\s-\s*$/, ''));
    return { line, name, email };
  });
}

export function plural(count, singular, pluralForm = `${singular}s`) {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

/** Data de hoje no formato do campo de data (AAAA-MM-DD), no fuso local. */
export function todayKey() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Mesmo cálculo do servidor: um amigo oculto nunca sai da lista, só muda de status.
 * draft = não sorteado, drawn = sorteado, finished = sorteado e a data do evento já passou.
 */
export function groupStatus(event, hasDraw) {
  if (!hasDraw) return 'draft';
  return DATE_REGEX.test(event.date) && event.date < todayKey() ? 'finished' : 'drawn';
}

export const STATUS_LABEL = { draft: 'Não sorteado', drawn: 'Sorteado', finished: 'Encerrado' };

/** "2026-12-24" => "24 de dez. de 2026". Outros formatos ficam como vieram. */
export function formatDate(value) {
  if (!DATE_REGEX.test(value)) return value;
  const [year, month, day] = value.split('-').map(Number);
  return new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(year, month - 1, day)),
  );
}

/** Quantos dias faltam até a data (negativo se já passou), ou null se não houver data válida. */
export function daysUntil(value) {
  if (!DATE_REGEX.test(value)) return null;
  const toUtc = (key) => Date.UTC(...key.split('-').map((n, i) => Number(n) - (i === 1 ? 1 : 0)));
  return Math.round((toUtc(value) - toUtc(todayKey())) / 86_400_000);
}

/** "50" => "R$ 50". Se já vier com "R$", fica como está. */
export function formatBudget(value) {
  const trimmed = value.trim();
  return /^R\$/i.test(trimmed) ? trimmed : `R$ ${trimmed}`;
}
