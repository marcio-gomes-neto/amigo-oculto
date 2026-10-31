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
 */
export function participantError({ name, email }, participants, ignoreId) {
  if (!name) return 'Informe o nome do participante.';
  if (name.length > 60) return 'O nome deve ter no máximo 60 caracteres.';
  if (!isValidEmail(email)) return 'Informe um email válido.';
  const others = participants.filter((p) => p.id !== ignoreId);
  if (others.some((p) => normalizeKey(p.name) === normalizeKey(name))) {
    return `Já existe alguém chamado "${name}". Use sobrenome ou apelido para não haver confusão.`;
  }
  if (others.some((p) => p.email.toLowerCase() === email.toLowerCase())) {
    return `O email ${email} já está cadastrado.`;
  }
  return null;
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
