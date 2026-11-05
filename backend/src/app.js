import fs from 'node:fs';
import path from 'node:path';
import cors from 'cors';
import express from 'express';
import { checkDraw, draw } from './draw.js';
import { renderDrawEmail } from './templates/drawEmail.js';
import { HttpError, isValidEmail, parseDrawPayload, parseEvent, parseStatePayload } from './validation.js';

async function sendDrawEmail(mailer, { giver, receiver, event, sharedEmail }) {
  const { subject, html, text } = renderDrawEmail({ giver, receiver, event, sharedEmail });
  await mailer.send({ to: giver.email, toName: giver.name, subject, html, text });
}

/** Emails usados por mais de um participante (em minúsculas). */
function sharedEmailsOf(people) {
  const count = new Map();
  for (const { email } of people) {
    const key = email.toLowerCase();
    count.set(key, (count.get(key) ?? 0) + 1);
  }
  return new Set([...count].filter(([, n]) => n > 1).map(([email]) => email));
}

/** Resultado público de um envio: NUNCA inclui quem a pessoa tirou. */
const publicResult = ({ id, name, email, status, error }) => ({ id, name, email, status, ...(error ? { error } : {}) });

/** Versão pública de um sorteio salvo no banco. */
function publicDraw(record) {
  if (!record) return null;
  const results = record.entries.map(publicResult);
  return {
    drawId: record.id,
    createdAt: record.createdAt,
    mode: record.mode,
    sent: results.filter((r) => r.status === 'sent').length,
    failed: results.filter((r) => r.status === 'failed').length,
    results,
  };
}

const errorMessage = (err) => err?.message || 'Erro desconhecido';

const notFound = () => new HttpError(404, 'Amigo oculto não encontrado.');

/** Data de hoje no fuso do servidor, no mesmo formato do campo de data do evento (AAAA-MM-DD). */
function today() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * Status de um amigo oculto (ele nunca sai da lista, só muda de status):
 *  - draft: ainda não foi sorteado;
 *  - drawn: já foi sorteado e o evento ainda vai acontecer (ou não tem data);
 *  - finished: já foi sorteado e a data do evento passou.
 */
export function groupStatus({ event, draw }, now = today()) {
  if (!draw) return 'draft';
  return /^\d{4}-\d{2}-\d{2}$/.test(event.date) && event.date < now ? 'finished' : 'drawn';
}

const groupSummary = (group) => ({ ...group, status: groupStatus(group) });

export function createApp({ mailer, db, corsOrigin, staticDir } = {}) {
  const app = express();
  app.disable('x-powered-by');
  if (corsOrigin) app.use('/api', cors({ origin: corsOrigin.split(',').map((o) => o.trim()) }));
  app.use(express.json({ limit: '300kb' }));

  const requireGroup = (req) => {
    const group = db.getGroup(req.params.groupId);
    if (!group) throw notFound();
    return group;
  };

  app.get('/api/health', (req, res) => {
    res.json({ ok: true, email: { mode: mailer.mode, configured: mailer.configured } });
  });

  /** Lista de amigos ocultos, com status e resumo do sorteio (nunca quem tirou quem). */
  app.get('/api/groups', (req, res) => {
    res.json({ groups: db.listGroups().map(groupSummary) });
  });

  /** Cria um amigo oculto vazio (opcionalmente já com os detalhes do evento). */
  app.post('/api/groups', (req, res) => {
    const { id, createdAt, event } = db.createGroup({ event: parseEvent(req.body?.event) });
    res.status(201).json(groupSummary({ id, createdAt, event, participants: 0, rules: 0, draw: null }));
  });

  /**
   * "Criar novo sorteio": cada amigo oculto tem um único sorteio, então sortear de novo
   * cria um novo amigo oculto na lista com os mesmos participantes e regras. O original fica como está.
   */
  app.post('/api/groups/:groupId/duplicate', (req, res) => {
    const group = requireGroup(req);
    const event = req.body?.event ? parseEvent(req.body.event) : group.event;
    const copy = db.duplicateGroup(group.id, { event });
    const { participants, rules } = db.getState(copy.id);
    res.status(201).json(
      groupSummary({
        id: copy.id,
        createdAt: copy.createdAt,
        event: copy.event,
        participants: participants.length,
        rules: rules.length,
        draw: null,
      }),
    );
  });

  /** Apaga o amigo oculto com participantes, regras e sorteios (emails já enviados não voltam). */
  app.delete('/api/groups/:groupId', (req, res) => {
    if (!db.deleteGroup(req.params.groupId)) throw notFound();
    res.json({ ok: true });
  });

  /** Tudo que a tela de um amigo oculto precisa para abrir: participantes, regras, evento e o último sorteio. */
  app.get('/api/groups/:groupId/state', (req, res) => {
    const group = requireGroup(req);
    res.json({ ...db.getState(group.id), lastDraw: publicDraw(db.getCurrentDraw(group.id)) });
  });

  /** Salva participantes, regras e evento (o frontend chama isso automaticamente a cada alteração). */
  app.put('/api/groups/:groupId/state', (req, res) => {
    const group = requireGroup(req);
    db.saveState(group.id, parseStatePayload(req.body));
    res.json({ ok: true });
  });

  /**
   * Verifica se é possível sortear com os participantes e regras informados.
   * Não sorteia de verdade nem envia nada: responde { ok: true } ou { ok: false, error }.
   */
  app.post('/api/draw/validate', (req, res) => {
    try {
      const { participants, rules } = parseDrawPayload(req.body);
      draw(participants, rules);
      res.json({ ok: true });
    } catch (err) {
      if (err.status === 400 || err.status === 422) return res.json({ ok: false, error: err.message });
      throw err;
    }
  });

  /** Realiza o sorteio do amigo oculto e envia um email para cada participante. */
  app.post('/api/groups/:groupId/draw', async (req, res) => {
    const group = requireGroup(req);
    if (group.currentDrawId) {
      throw new HttpError(409, 'Este amigo oculto já foi sorteado. Para sortear de novo, crie um novo sorteio a partir dele.');
    }
    const { participants, rules, event } = parseDrawPayload(req.body);
    const assignments = draw(participants, rules);

    // Testa a conexão antes de enviar qualquer email, para não deixar o sorteio pela metade.
    try {
      await mailer.verify();
    } catch (err) {
      throw new HttpError(
        502,
        `Não foi possível conectar ao servidor de email: ${errorMessage(err)}. Nenhum email foi enviado.`,
      );
    }

    // Guarda o sorteio no banco antes de enviar: se algo falhar no meio, dá para reenviar depois.
    const receiverOf = new Map(assignments.map(({ giverId, receiverId }) => [giverId, receiverId]));
    const record = db.createDraw({ groupId: group.id, participants, receiverOf, event, mode: mailer.mode });
    const byId = new Map(participants.map((p) => [p.id, p]));
    const sharedEmails = sharedEmailsOf(participants);

    // Envia na ordem em que os participantes foram cadastrados (e não na ordem do
    // ciclo), para que nem a ordem dos envios revele quem tirou quem.
    for (const giver of participants) {
      const receiver = byId.get(receiverOf.get(giver.id));
      const sharedEmail = sharedEmails.has(giver.email.toLowerCase());
      try {
        await sendDrawEmail(mailer, { giver, receiver, event, sharedEmail });
        db.updateEntry(record.id, giver.id, { email: giver.email, status: 'sent' });
      } catch (err) {
        db.updateEntry(record.id, giver.id, { email: giver.email, status: 'failed', error: errorMessage(err) });
      }
    }

    res.status(201).json(publicDraw(db.getDraw(record.id)));
  });

  /** Reenvia o email de um participante (opcionalmente corrigindo o email, se o envio falhou). */
  app.post('/api/draw/:drawId/resend', async (req, res) => {
    const record = db.getDraw(req.params.drawId);
    if (!record) throw new HttpError(404, 'Sorteio não encontrado.');

    const { participantId, email } = req.body ?? {};
    const entry = record.entries.find((e) => e.id === participantId);
    if (!entry) throw new HttpError(404, 'Participante não encontrado neste sorteio.');

    const giver = { id: entry.id, name: entry.name, email: entry.email };
    const newEmail = typeof email === 'string' ? email.trim() : '';
    if (newEmail && newEmail.toLowerCase() !== giver.email.toLowerCase()) {
      if (entry.status !== 'failed') {
        throw new HttpError(403, 'Só é possível alterar o email de quem não recebeu a mensagem.');
      }
      if (!isValidEmail(newEmail)) throw new HttpError(400, 'Email inválido.');
      giver.email = newEmail;
    }

    const receiver = record.entries.find((e) => e.id === entry.receiverId);
    const people = record.entries.map((e) => (e.id === giver.id ? giver : e));
    const sharedEmail = sharedEmailsOf(people).has(giver.email.toLowerCase());
    let result;
    try {
      await sendDrawEmail(mailer, { giver, receiver, event: record.event, sharedEmail });
      result = { ...giver, status: 'sent' };
    } catch (err) {
      result = { ...giver, status: 'failed', error: errorMessage(err) };
    }
    db.updateEntry(record.id, giver.id, result);
    res.json({ result: publicResult(result) });
  });

  /**
   * Área secreta: sorteios do amigo oculto com a conferência de integridade e o
   * status dos envios. Ainda NÃO revela os pares — isso é feito um por vez abaixo.
   */
  app.get('/api/debug/groups/:groupId/draws', (req, res) => {
    const group = requireGroup(req);
    const draws = db.listDraws(group.id).map((record) => ({
      ...publicDraw(record),
      current: record.id === group.currentDrawId,
      check: checkDraw(record.entries),
    }));
    res.json({ event: group.event, draws });
  });

  /**
   * Área secreta: revela UM par. direction=receiver responde quem a pessoa tirou;
   * direction=giver responde quem tirou a pessoa.
   */
  app.get('/api/debug/draws/:drawId/reveal', (req, res) => {
    const record = db.getDraw(req.params.drawId);
    if (!record) throw new HttpError(404, 'Sorteio não encontrado.');

    const { participantId, direction } = req.query;
    if (direction !== 'receiver' && direction !== 'giver') {
      throw new HttpError(400, 'Informe direction=receiver (quem a pessoa tirou) ou direction=giver (quem tirou a pessoa).');
    }
    const person = record.entries.find((e) => e.id === participantId);
    if (!person) throw new HttpError(404, 'Participante não encontrado neste sorteio.');

    const giver = direction === 'receiver' ? person : record.entries.find((e) => e.receiverId === person.id);
    const receiver = record.entries.find((e) => e.id === giver?.receiverId);
    if (!giver || !receiver) throw new HttpError(409, 'Este sorteio está inconsistente: o par não foi encontrado.');

    const asked = direction === 'receiver' ? `quem ${person.name} tirou` : `quem tirou ${person.name}`;
    console.log(`🔒 Área secreta: consultado ${asked} (sorteio ${record.id})`);
    res.json({ giver: { id: giver.id, name: giver.name }, receiver: { id: receiver.id, name: receiver.name } });
  });

  /** Pré-visualização do template de email com nomes de exemplo. */
  app.get('/api/email/preview', (req, res) => {
    const pick = (key) => (typeof req.query[key] === 'string' ? req.query[key] : undefined);
    let event;
    try {
      event = parseEvent({ name: pick('name'), date: pick('date'), budget: pick('budget'), message: pick('message') });
    } catch {
      event = {};
    }
    const hasEvent = Object.values(event).some(Boolean);
    const { html } = renderDrawEmail({
      sharedEmail: req.query.shared === '1',
      giver: { name: 'Maria Silva', email: 'maria.silva@exemplo.com' },
      receiver: { name: 'João Pereira' },
      event: hasEvent
        ? event
        : {
            name: 'Amigo Oculto da Família',
            date: '2026-12-24',
            budget: 'R$ 100,00',
            message: 'Vamos nos encontrar às 20h na casa da vó. Tragam o presente embrulhado!',
          },
    });
    res.type('html').send(html);
  });

  app.use('/api', (req, res) => {
    res.status(404).json({ error: 'Rota não encontrada.' });
  });

  // Em produção, serve o frontend já compilado (npm run build).
  if (staticDir && fs.existsSync(path.join(staticDir, 'index.html'))) {
    app.use(express.static(staticDir));
    app.use((req, res, next) => {
      if (req.method !== 'GET') return next();
      res.sendFile(path.join(staticDir, 'index.html'));
    });
  }

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'JSON inválido no corpo da requisição.' });
    }
    if (err.type === 'entity.too.large') {
      return res.status(413).json({ error: 'Requisição muito grande.' });
    }
    const status = err.status ?? 500;
    if (status >= 500 && status !== 502) console.error(err);
    res.status(status).json({ error: status === 500 ? 'Erro interno no servidor.' : err.message });
  });

  return app;
}
