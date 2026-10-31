import { randomInt } from 'node:crypto';

/**
 * Algoritmo de sorteio do amigo oculto.
 *
 * A ideia é formar UM ÚNICO CICLO com todos os participantes:
 *
 *   [Ana, Bruno, Carla, Diego]  =>  Ana → Bruno → Carla → Diego → Ana
 *
 * A posição 1 tira a posição 2, que tira a posição 3, ... e a última tira a
 * primeira. Como o ciclo passa por todo mundo, é impossível alguém tirar a si
 * mesmo ou sobrar alguém sem amigo oculto (o famoso "deu zebra").
 *
 * Regras suportadas (sempre de MÃO ÚNICA):
 *  - block: `from` NÃO pode tirar `to`  (mas `to` ainda pode tirar `from`)
 *  - force: `from` OBRIGATORIAMENTE tira `to`
 *
 * Regras obrigatórias viram "segmentos" fixos dentro do ciclo. Se Ana deve
 * tirar Bruno e Bruno deve tirar Carla, o segmento [Ana, Bruno, Carla] fica
 * sempre junto. O sorteio então embaralha os segmentos até encontrar uma
 * ordem em que nenhuma ligação entre segmentos esteja bloqueada.
 */

export const MIN_PARTICIPANTS = 3;
export const RULE_TYPES = Object.freeze(['block', 'force']);

/** Tentativas de embaralhamento puro antes de partir para a busca completa. */
const RANDOM_ATTEMPTS = 2000;
/** Limite de passos da busca com backtracking (evita travar com regras absurdas). */
const MAX_SEARCH_STEPS = 500_000;

export class DrawError extends Error {
  constructor(message) {
    super(message);
    this.name = 'DrawError';
    this.status = 422;
  }
}

/** Fisher–Yates usando o gerador criptográfico do Node. */
export function shuffle(items) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Realiza o sorteio.
 *
 * @param {{id: string, name: string}[]} participants
 * @param {{type: 'block'|'force', from: string, to: string}[]} rules
 * @returns {{giverId: string, receiverId: string}[]} pares na ordem do ciclo
 * @throws {DrawError} quando as regras tornam o sorteio impossível
 */
export function draw(participants, rules = []) {
  if (participants.length < MIN_PARTICIPANTS) {
    throw new DrawError(`São necessários pelo menos ${MIN_PARTICIPANTS} participantes para o sorteio.`);
  }

  const { blocked, forcedNext, name } = buildConstraints(participants, rules);
  const canDraw = (giverId, receiverId) => !blocked.get(giverId).has(receiverId);

  // 1) Monta os segmentos formados pelas regras obrigatórias.
  const { segments, closedCycle } = buildSegments(participants, forcedNext);

  if (closedCycle) {
    if (closedCycle.length === participants.length) {
      // As regras obrigatórias já definem o sorteio inteiro.
      return toAssignments(closedCycle);
    }
    const loop = [...closedCycle, closedCycle[0]].map(name).join(' → ');
    throw new DrawError(
      `As regras obrigatórias formam um ciclo fechado (${loop}) que deixa os demais participantes de fora.`,
    );
  }

  const head = (segment) => segment[0];
  const tail = (segment) => segment[segment.length - 1];
  const canLink = (a, b) => canDraw(tail(a), head(b));

  // 2) Caso especial: um único segmento com todo mundo.
  if (segments.length === 1) {
    const [only] = segments;
    if (!canLink(only, only)) {
      throw new DrawError(
        `As regras obrigatórias definem toda a sequência, mas ${name(tail(only))} não pode tirar ` +
          `${name(head(only))} para fechar o ciclo.`,
      );
    }
    return toAssignments(only);
  }

  // 3) Verificações rápidas para dar mensagens de erro claras.
  for (const segment of segments) {
    if (!segments.some((other) => other !== segment && canLink(segment, other))) {
      throw new DrawError(
        `Não sobrou ninguém para ${name(tail(segment))} tirar com as regras atuais ` +
          '(considerando bloqueios e regras obrigatórias).',
      );
    }
    if (!segments.some((other) => other !== segment && canLink(other, segment))) {
      throw new DrawError(
        `Ninguém consegue tirar ${name(head(segment))} com as regras atuais ` +
          '(considerando bloqueios e regras obrigatórias).',
      );
    }
  }

  // 4) Embaralha até achar um ciclo válido. Cada ordem circular válida tem a
  //    mesma chance de sair, então o sorteio é justo.
  const total = segments.length;
  for (let attempt = 0; attempt < RANDOM_ATTEMPTS; attempt++) {
    const order = shuffle(segments);
    if (order.every((segment, i) => canLink(segment, order[(i + 1) % total]))) {
      return toAssignments(order.flat());
    }
  }

  // 5) Regras muito restritivas: busca completa (aleatorizada) com backtracking.
  const order = searchCycle(segments, canLink);
  if (!order) {
    throw new DrawError(
      'Não existe nenhuma combinação possível com as regras atuais. Remova alguns bloqueios ou regras obrigatórias.',
    );
  }
  return toAssignments(order.flat());
}

/** Valida as regras e monta as estruturas de restrição. */
function buildConstraints(participants, rules) {
  const byId = new Map(participants.map((p) => [p.id, p]));
  const name = (id) => byId.get(id)?.name ?? id;

  const blocked = new Map(participants.map((p) => [p.id, new Set()]));
  const forcedNext = new Map(); // quem `from` obrigatoriamente tira
  const forcedPrev = new Map(); // quem obrigatoriamente tira `to`

  for (const { type, from, to } of rules) {
    if (!RULE_TYPES.includes(type)) {
      throw new DrawError(`Tipo de regra inválido: "${type}".`);
    }
    if (!byId.has(from) || !byId.has(to)) {
      throw new DrawError('Uma das regras faz referência a um participante que não existe mais.');
    }
    if (from === to) {
      throw new DrawError(`${name(from)} não pode ter uma regra envolvendo a própria pessoa.`);
    }

    if (type === 'block') {
      blocked.get(from).add(to);
      continue;
    }

    const currentTarget = forcedNext.get(from);
    if (currentTarget !== undefined && currentTarget !== to) {
      throw new DrawError(
        `${name(from)} tem duas regras obrigatórias (tirar ${name(currentTarget)} e tirar ${name(to)}). ` +
          'Cada pessoa só pode ter uma.',
      );
    }
    const currentGiver = forcedPrev.get(to);
    if (currentGiver !== undefined && currentGiver !== from) {
      throw new DrawError(
        `Duas pessoas estão obrigadas a tirar ${name(to)} (${name(currentGiver)} e ${name(from)}). ` +
          'Cada pessoa só pode ser tirada por uma.',
      );
    }
    forcedNext.set(from, to);
    forcedPrev.set(to, from);
  }

  for (const [from, to] of forcedNext) {
    if (blocked.get(from).has(to)) {
      throw new DrawError(
        `Regras contraditórias: ${name(from)} deve tirar ${name(to)}, mas também está bloqueado de tirar ${name(to)}.`,
      );
    }
  }

  return { blocked, forcedNext, name };
}

/**
 * Agrupa os participantes em segmentos encadeados pelas regras obrigatórias.
 * Se as regras formarem um ciclo fechado, ele é retornado em `closedCycle`.
 */
function buildSegments(participants, forcedNext) {
  const isForcedTarget = new Set(forcedNext.values());
  const visited = new Set();
  const segments = [];

  for (const { id } of participants) {
    if (isForcedTarget.has(id)) continue; // não é início de segmento
    const segment = [];
    for (let current = id; current !== undefined; current = forcedNext.get(current)) {
      segment.push(current);
      visited.add(current);
    }
    segments.push(segment);
  }

  // Quem não foi visitado faz parte de um ciclo fechado de regras obrigatórias.
  const leftover = participants.find((p) => !visited.has(p.id));
  if (leftover) {
    const closedCycle = [];
    let current = leftover.id;
    do {
      closedCycle.push(current);
      current = forcedNext.get(current);
    } while (current !== leftover.id);
    return { segments, closedCycle };
  }

  return { segments, closedCycle: null };
}

/** Busca em profundidade aleatorizada por um ciclo que passe por todos os segmentos. */
function searchCycle(segments, canLink) {
  const [first, ...rest] = shuffle(segments);
  const path = [first];
  const used = new Set([first]);
  let steps = 0;

  const visit = () => {
    if (++steps > MAX_SEARCH_STEPS) {
      throw new DrawError(
        'As regras estão restritivas demais e não foi possível encontrar uma combinação. ' +
          'Remova alguns bloqueios ou regras obrigatórias.',
      );
    }
    const last = path[path.length - 1];
    if (path.length === segments.length) return canLink(last, first);

    for (const next of shuffle(rest)) {
      if (used.has(next) || !canLink(last, next)) continue;
      used.add(next);
      path.push(next);
      if (visit()) return true;
      used.delete(next);
      path.pop();
    }
    return false;
  };

  return visit() ? path : null;
}

/** Converte a ordem do ciclo em pares: posição i tira posição i + 1 (a última tira a primeira). */
function toAssignments(cycle) {
  return cycle.map((giverId, i) => ({
    giverId,
    receiverId: cycle[(i + 1) % cycle.length],
  }));
}
