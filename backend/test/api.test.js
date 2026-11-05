import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { after, before, beforeEach, describe, it } from 'node:test';
import { createApp } from '../src/app.js';
import { openDatabase } from '../src/db.js';

/** Mailer falso que guarda as mensagens em memória. */
function createFakeMailer() {
  const mailer = {
    mode: 'smtp',
    configured: true,
    sent: [],
    failFor: new Set(),
    verifyError: null,
    async verify() {
      if (mailer.verifyError) throw mailer.verifyError;
    },
    async send(message) {
      if (mailer.failFor.has(message.to)) throw new Error('Mailbox unavailable');
      mailer.sent.push(message);
    },
  };
  return mailer;
}

/** Sobe a API numa porta aleatória e devolve helpers para chamá-la. */
async function startServer({ mailer, db }) {
  const app = createApp({ mailer, db });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const request = async (method, path, body) => {
    const res = await fetch(baseUrl + path, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, body: await res.json() };
  };
  return { baseUrl, request, close: () => new Promise((resolve) => server.close(resolve)) };
}

const participants = [
  { id: 'a', name: 'Ana Souza', email: 'ana@exemplo.com' },
  { id: 'b', name: 'Bruno Lima', email: 'bruno@exemplo.com' },
  { id: 'c', name: 'Carla Dias', email: 'carla@exemplo.com' },
  { id: 'd', name: 'Diego Reis', email: 'diego@exemplo.com' },
];

describe('API', () => {
  let api;
  let baseUrl;
  let mailer;
  let db;
  let groupPath;

  before(async () => {
    mailer = createFakeMailer();
    db = openDatabase(':memory:');
    api = await startServer({ mailer, db });
    baseUrl = api.baseUrl;
  });

  after(async () => {
    await api.close();
    db.close();
  });

  // Cada teste usa um amigo oculto novo (cada um só pode ser sorteado uma vez).
  beforeEach(async () => {
    mailer.sent = [];
    mailer.failFor = new Set();
    mailer.verifyError = null;
    const created = await api.request('POST', '/api/groups', { event: { name: 'Natal' } });
    groupPath = `/api/groups/${created.body.id}`;
  });

  const post = (path, body) => api.request('POST', path, body);

  it('GET/PUT /api/state salva e devolve participantes, regras e evento', async () => {
    const empty = await api.request('GET', `${groupPath}/state`);
    assert.equal(empty.status, 200);
    assert.deepEqual(empty.body.participants, []);
    assert.deepEqual(empty.body.rules, []);
    assert.equal(empty.body.lastDraw, null);

    const state = {
      participants: participants.slice(0, 2),
      rules: [{ id: 'r1', type: 'block', from: 'a', to: 'b' }],
      event: { name: 'Natal', date: '2026-12-24', budget: 'R$ 50', message: '' },
    };
    const saved = await api.request('PUT', `${groupPath}/state`, state);
    assert.equal(saved.status, 200);

    const loaded = await api.request('GET', `${groupPath}/state`);
    assert.deepEqual(loaded.body.participants, state.participants);
    assert.deepEqual(loaded.body.rules, state.rules);
    assert.deepEqual(loaded.body.event, state.event);

    // Regra apontando para alguém que não existe é recusada (e nada é alterado).
    const invalid = await api.request('PUT', `${groupPath}/state`, {
      participants: participants.slice(0, 1),
      rules: [{ id: 'r1', type: 'block', from: 'a', to: 'b' }],
    });
    assert.equal(invalid.status, 400);
    assert.equal((await api.request('GET', `${groupPath}/state`)).body.participants.length, 2);

    await api.request('PUT', `${groupPath}/state`, { participants: [], rules: [] });
  });

  it('GET /api/health informa o modo de email', async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    assert.deepEqual(await res.json(), { ok: true, email: { mode: 'smtp', configured: true } });
  });

  it('POST /api/draw/validate aceita regras possíveis e recusa impossíveis', async () => {
    const ok = await post('/api/draw/validate', { participants, rules: [{ type: 'block', from: 'a', to: 'b' }] });
    assert.equal(ok.status, 200);
    assert.deepEqual(ok.body, { ok: true });

    const impossible = await post('/api/draw/validate', {
      participants,
      rules: [
        { type: 'block', from: 'a', to: 'b' },
        { type: 'block', from: 'a', to: 'c' },
        { type: 'block', from: 'a', to: 'd' },
      ],
    });
    assert.equal(impossible.status, 200);
    assert.equal(impossible.body.ok, false);
    assert.match(impossible.body.error, /Ana Souza/);
    assert.equal(mailer.sent.length, 0);
  });

  it('POST /api/draw recusa sorteio impossível sem enviar nada', async () => {
    const res = await post(`${groupPath}/draw`, {
      participants,
      rules: [
        { type: 'force', from: 'a', to: 'b' },
        { type: 'force', from: 'b', to: 'a' },
      ],
    });
    assert.equal(res.status, 422);
    assert.match(res.body.error, /ciclo fechado/);
    assert.equal(mailer.sent.length, 0);
  });

  it('valida o payload (nomes repetidos, emails inválidos)', async () => {
    const dupName = await post(`${groupPath}/draw`, {
      participants: [...participants, { id: 'e', name: 'ana souza', email: 'outra@exemplo.com' }],
    });
    assert.equal(dupName.status, 400);
    assert.match(dupName.body.error, /dois participantes chamados/);

    // Mesmo nome é recusado mesmo com o mesmo email.
    const sameNameSameEmail = await post('/api/draw/validate', {
      participants: [...participants, { id: 'e', name: 'Ana Souza', email: 'ana@exemplo.com' }],
    });
    assert.equal(sameNameSameEmail.body.ok, false);

    const badEmail = await post(`${groupPath}/draw`, {
      participants: [...participants.slice(0, 3), { id: 'e', name: 'Eva', email: 'eva@' }],
    });
    assert.equal(badEmail.status, 400);
    assert.match(badEmail.body.error, /email de Eva/);
    assert.equal(mailer.sent.length, 0);
  });

  it('POST /api/draw envia um email por pessoa, respeitando regras e sem revelar pares', async () => {
    const rules = [
      { type: 'force', from: 'a', to: 'c' },
      { type: 'block', from: 'b', to: 'd' },
    ];
    const res = await post(`${groupPath}/draw`, { participants, rules, event: { name: 'Natal 2026', budget: 'R$ 50' } });
    assert.equal(res.status, 201);
    assert.equal(res.body.sent, 4);
    assert.equal(res.body.failed, 0);
    assert.ok(res.body.drawId);

    // A resposta segue a ordem de cadastro e não contém quem tirou quem.
    assert.deepEqual(
      res.body.results.map((r) => r.id),
      ['a', 'b', 'c', 'd'],
    );
    const serialized = JSON.stringify(res.body);
    assert.ok(!/receiver/i.test(serialized));

    // Cada participante recebeu exatamente um email, com o próprio nome.
    assert.equal(mailer.sent.length, 4);
    for (const p of participants) {
      const mail = mailer.sent.find((m) => m.to === p.email);
      assert.ok(mail, `email para ${p.name}`);
      assert.ok(mail.subject.includes(p.name));
      assert.ok(mail.subject.includes('Natal 2026'));
      assert.ok(mail.html.includes(p.email));
    }

    // Ana deve ter tirado Carla.
    const anaMail = mailer.sent.find((m) => m.to === 'ana@exemplo.com');
    assert.match(anaMail.text, /SEU AMIGO OCULTO É: CARLA DIAS/);
    const brunoMail = mailer.sent.find((m) => m.to === 'bruno@exemplo.com');
    assert.doesNotMatch(brunoMail.text, /SEU AMIGO OCULTO É: DIEGO REIS/);
  });

  it('permite email repetido com nomes diferentes: cada pessoa recebe o próprio email', async () => {
    const family = [
      { id: 'a', name: 'Ana Souza', email: 'familia@exemplo.com' },
      { id: 'b', name: 'Bruno Souza', email: 'FAMILIA@exemplo.com' },
      { id: 'c', name: 'Carla Dias', email: 'carla@exemplo.com' },
      { id: 'd', name: 'Diego Reis', email: 'diego@exemplo.com' },
    ];
    const ok = await post('/api/draw/validate', { participants: family });
    assert.deepEqual(ok.body, { ok: true });

    const res = await post(`${groupPath}/draw`, { participants: family });
    assert.equal(res.status, 201);
    assert.equal(res.body.sent, 4);

    const shared = mailer.sent.filter((m) => m.to.toLowerCase() === 'familia@exemplo.com');
    assert.equal(shared.length, 2);
    assert.deepEqual(shared.map((m) => m.toName).sort(), ['Ana Souza', 'Bruno Souza']);
    for (const mail of shared) {
      assert.ok(mail.subject.includes(mail.toName), 'assunto identifica a pessoa');
      assert.match(mail.html, /usado por mais de um participante/);
      assert.match(mail.text, new RegExp(`SOMENTE de ${mail.toName}`));
    }
    const carla = mailer.sent.find((m) => m.to === 'carla@exemplo.com');
    assert.doesNotMatch(carla.html, /usado por mais de um participante/);

    // Ao corrigir um email no reenvio, também pode usar um endereço que já existe.
    // (cada amigo oculto só é sorteado uma vez, então o segundo sorteio é num amigo oculto novo)
    mailer.failFor.add('diego@exemplo.com');
    const otherGroup = (await post('/api/groups', { event: { name: 'Natal' } })).body.id;
    const second = await post(`/api/groups/${otherGroup}/draw`, { participants: family });
    const resend = await post(`/api/draw/${second.body.drawId}/resend`, {
      participantId: 'd',
      email: 'carla@exemplo.com',
    });
    assert.equal(resend.body.result.status, 'sent');
    const diegoMail = mailer.sent.at(-1);
    assert.equal(diegoMail.to, 'carla@exemplo.com');
    assert.equal(diegoMail.toName, 'Diego Reis');
    assert.match(diegoMail.html, /usado por mais de um participante/);
  });

  it('não envia nada se a conexão com o servidor de email falhar', async () => {
    mailer.verifyError = new Error('Invalid login');
    const res = await post(`${groupPath}/draw`, { participants });
    assert.equal(res.status, 502);
    assert.match(res.body.error, /Invalid login/);
    assert.match(res.body.error, /Nenhum email foi enviado/);
    assert.equal(mailer.sent.length, 0);
  });

  it('permite reenviar para quem falhou, corrigindo o email, sem refazer o sorteio', async () => {
    mailer.failFor.add('bruno@exemplo.com');
    const res = await post(`${groupPath}/draw`, { participants });
    assert.equal(res.status, 201);
    assert.equal(res.body.failed, 1);
    const bruno = res.body.results.find((r) => r.id === 'b');
    assert.equal(bruno.status, 'failed');
    assert.match(bruno.error, /Mailbox unavailable/);

    const firstText = mailer.sent.map((m) => m.text);

    // Não pode trocar o email de quem já recebeu.
    const forbidden = await post(`/api/draw/${res.body.drawId}/resend`, { participantId: 'a', email: 'x@exemplo.com' });
    assert.equal(forbidden.status, 403);

    const resend = await post(`/api/draw/${res.body.drawId}/resend`, {
      participantId: 'b',
      email: 'bruno.lima@exemplo.com',
    });
    assert.equal(resend.status, 200);
    assert.equal(resend.body.result.status, 'sent');
    assert.equal(resend.body.result.email, 'bruno.lima@exemplo.com');

    // O sorteio é o mesmo: os 3 primeiros emails não mudaram e o 4º completa o ciclo.
    assert.deepEqual(mailer.sent.slice(0, 3).map((m) => m.text), firstText);
    const names = participants.map((p) => p.name.toUpperCase());
    const drawnNames = mailer.sent.map((m) => names.find((n) => m.text.includes(`SEU AMIGO OCULTO É: ${n}`)));
    assert.equal(new Set(drawnNames).size, 4);
  });

  it('reenvio para sorteio inexistente retorna 404', async () => {
    const res = await post('/api/draw/nao-existe/resend', { participantId: 'a' });
    assert.equal(res.status, 404);
  });

  it('o sorteio aparece no estado (sem revelar pares) e não pode ser refeito no mesmo amigo oculto', async () => {
    const res = await post(`${groupPath}/draw`, { participants });
    assert.equal(res.status, 201);

    const state = await api.request('GET', `${groupPath}/state`);
    assert.equal(state.body.lastDraw.drawId, res.body.drawId);
    assert.equal(state.body.lastDraw.sent, 4);
    assert.ok(!/receiver/i.test(JSON.stringify(state.body)));

    const again = await post(`${groupPath}/draw`, { participants });
    assert.equal(again.status, 409);
    assert.match(again.body.error, /já foi sorteado/);
    assert.equal(mailer.sent.length, 4);
    assert.equal((await api.request('GET', `${groupPath}/state`)).body.lastDraw.drawId, res.body.drawId);
  });

  it('"criar novo sorteio" cria outro amigo oculto na lista, sem mexer no original', async () => {
    const rules = [{ id: 'r1', type: 'block', from: 'a', to: 'b' }];
    const event = { name: 'Natal', date: '2999-12-24', budget: 'R$ 50', message: 'Às 20h' };
    await api.request('PUT', `${groupPath}/state`, { participants, rules, event });
    const first = await post(`${groupPath}/draw`, { participants, rules, event });
    assert.equal(first.status, 201);

    const copy = await post(`${groupPath}/duplicate`, { event: { ...event, name: 'Natal (novo sorteio)' } });
    assert.equal(copy.status, 201);
    assert.equal(copy.body.status, 'draft');
    assert.equal(copy.body.draw, null);
    assert.deepEqual({ participants: copy.body.participants, rules: copy.body.rules }, { participants: 4, rules: 1 });

    const copyState = (await api.request('GET', `/api/groups/${copy.body.id}/state`)).body;
    assert.deepEqual(copyState.participants, participants);
    assert.deepEqual(copyState.rules, rules);
    assert.deepEqual(copyState.event, { ...event, name: 'Natal (novo sorteio)' });
    assert.equal(copyState.lastDraw, null);

    // O novo pode ser sorteado; o original continua com o próprio sorteio.
    const second = await post(`/api/groups/${copy.body.id}/draw`, { participants, rules, event: copyState.event });
    assert.equal(second.status, 201);
    assert.notEqual(second.body.drawId, first.body.drawId);
    assert.equal((await api.request('GET', `${groupPath}/state`)).body.lastDraw.drawId, first.body.drawId);

    // Sem evento no corpo, copia o evento do original.
    const plain = await post(`${groupPath}/duplicate`, {});
    assert.equal(plain.body.event.name, 'Natal');
    assert.equal((await post('/api/groups/nao-existe/duplicate', {})).status, 404);
  });

  it('gerencia vários amigos ocultos, cada um com seus dados e status', async () => {
    const familia = (await post('/api/groups', { event: { name: 'Família', date: '2999-12-24' } })).body;
    const trabalho = (await post('/api/groups', { event: { name: 'Trabalho', date: '2020-12-20' } })).body;
    assert.equal(familia.status, 'draft');
    assert.equal(familia.participants, 0);
    assert.equal(familia.draw, null);

    // Os mesmos ids de participantes podem existir em amigos ocultos diferentes.
    await api.request('PUT', `/api/groups/${familia.id}/state`, { participants, rules: [], event: familia.event });
    await api.request('PUT', `/api/groups/${trabalho.id}/state`, {
      participants: participants.slice(0, 3),
      rules: [{ id: 'r1', type: 'block', from: 'a', to: 'b' }],
      event: trabalho.event,
    });
    assert.equal((await api.request('GET', `/api/groups/${familia.id}/state`)).body.participants.length, 4);
    assert.equal((await api.request('GET', `/api/groups/${trabalho.id}/state`)).body.rules.length, 1);

    // Depois do sorteio: "drawn" se o evento ainda vai acontecer, "finished" se a data já passou.
    await post(`/api/groups/${familia.id}/draw`, { participants, event: familia.event });
    await post(`/api/groups/${trabalho.id}/draw`, { participants: participants.slice(0, 3), event: trabalho.event });

    const list = (await api.request('GET', '/api/groups')).body.groups;
    const byId = new Map(list.map((g) => [g.id, g]));
    assert.equal(byId.get(familia.id).status, 'drawn');
    assert.deepEqual(
      { participants: byId.get(familia.id).participants, sent: byId.get(familia.id).draw.sent },
      { participants: 4, sent: 4 },
    );
    assert.equal(byId.get(trabalho.id).status, 'finished');
    assert.equal(byId.get(trabalho.id).rules, 1);
    assert.ok(!/receiver/i.test(JSON.stringify(list)));

    // Apagar remove tudo daquele amigo oculto, sem mexer nos outros.
    assert.equal((await api.request('DELETE', `/api/groups/${trabalho.id}`)).status, 200);
    assert.equal((await api.request('GET', `/api/groups/${trabalho.id}/state`)).status, 404);
    assert.equal((await api.request('DELETE', `/api/groups/${trabalho.id}`)).status, 404);
    assert.equal((await api.request('GET', `/api/groups/${familia.id}/state`)).body.participants.length, 4);
    await api.request('DELETE', `/api/groups/${familia.id}`);
  });

  it('rotas de um amigo oculto inexistente retornam 404', async () => {
    assert.equal((await api.request('GET', '/api/groups/nao-existe/state')).status, 404);
    assert.equal((await api.request('PUT', '/api/groups/nao-existe/state', { participants: [] })).status, 404);
    const drawRes = await post('/api/groups/nao-existe/draw', { participants });
    assert.equal(drawRes.status, 404);
    assert.equal(mailer.sent.length, 0);
  });

  it('GET /api/email/preview renderiza o template', async () => {
    const res = await fetch(`${baseUrl}/api/email/preview?name=${encodeURIComponent('Natal <b>')}`);
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.match(html, /Seu amigo oculto é/);
    assert.match(html, /Natal &lt;b&gt;/);
  });
});

describe('Área secreta (debug)', () => {
  let api;
  let db;
  let mailer;
  let groupId;
  let drawId;
  const secret = (path) => api.request('GET', path);

  before(async () => {
    mailer = createFakeMailer();
    db = openDatabase(':memory:');
    api = await startServer({ mailer, db });
    groupId = (await api.request('POST', '/api/groups', { event: { name: 'Natal' } })).body.id;
    const rules = [{ type: 'force', from: 'a', to: 'c' }];
    drawId = (await api.request('POST', `/api/groups/${groupId}/draw`, { participants, rules })).body.drawId;
  });

  after(async () => {
    await api.close();
    db.close();
  });

  it('lista os sorteios com a conferência, sem revelar os pares', async () => {
    const res = await secret(`/api/debug/groups/${groupId}/draws`);
    assert.equal(res.status, 200);
    assert.equal(res.body.event.name, 'Natal');
    assert.equal(res.body.draws.length, 1);
    const [record] = res.body.draws;
    assert.equal(record.drawId, drawId);
    assert.equal(record.current, true);
    assert.deepEqual(record.check, { ok: true, problems: [] });
    assert.equal(record.results.length, 4);
    assert.ok(!/receiver/i.test(JSON.stringify(res.body)));
  });

  it('revela um par por vez, nas duas direções', async () => {
    const drew = await secret(`/api/debug/draws/${drawId}/reveal?participantId=a&direction=receiver`);
    assert.equal(drew.status, 200);
    assert.deepEqual(drew.body, { giver: { id: 'a', name: 'Ana Souza' }, receiver: { id: 'c', name: 'Carla Dias' } });

    const drawnBy = await secret(`/api/debug/draws/${drawId}/reveal?participantId=c&direction=giver`);
    assert.deepEqual(drawnBy.body, drew.body);

    assert.equal((await secret(`/api/debug/draws/${drawId}/reveal?participantId=a`)).status, 400);
    assert.equal((await secret(`/api/debug/draws/${drawId}/reveal?participantId=zz&direction=giver`)).status, 404);
    assert.equal((await secret('/api/debug/draws/nao-existe/reveal?participantId=a&direction=giver')).status, 404);
  });

  it('um novo sorteio fica no novo amigo oculto, separado do original', async () => {
    const copyId = (await api.request('POST', `/api/groups/${groupId}/duplicate`, {})).body.id;
    const copyDraw = (await api.request('POST', `/api/groups/${copyId}/draw`, { participants })).body.drawId;

    const original = (await secret(`/api/debug/groups/${groupId}/draws`)).body.draws;
    const copy = (await secret(`/api/debug/groups/${copyId}/draws`)).body.draws;
    assert.deepEqual(
      original.map((d) => d.drawId),
      [drawId],
    );
    assert.deepEqual(
      copy.map((d) => d.drawId),
      [copyDraw],
    );
  });
});

describe('Persistência no SQLite', () => {
  it('o sorteio sobrevive a um reinício do servidor', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'amigo-oculto-'));
    const file = path.join(dir, 'test.db');
    const mailer = createFakeMailer();
    mailer.failFor.add('carla@exemplo.com');
    let db;
    let api;

    try {
      // Primeira "execução" do servidor: sorteia, com uma falha de envio para a Carla.
      db = openDatabase(file);
      api = await startServer({ mailer, db });
      const created = await api.request('POST', '/api/groups', {});
      const groupPath = `/api/groups/${created.body.id}`;
      await api.request('PUT', `${groupPath}/state`, { participants, rules: [], event: { name: 'Natal' } });
      const drawn = await api.request('POST', `${groupPath}/draw`, { participants, event: { name: 'Natal' } });
      assert.equal(drawn.body.failed, 1);
      await api.close();
      db.close();

      // Segunda "execução": tudo continua lá e o reenvio usa o MESMO sorteio.
      mailer.failFor.clear();
      db = openDatabase(file);
      api = await startServer({ mailer, db });
      const state = await api.request('GET', `${groupPath}/state`);
      assert.equal(state.body.participants.length, 4);
      assert.equal(state.body.event.name, 'Natal');
      assert.equal(state.body.lastDraw.drawId, drawn.body.drawId);
      assert.equal(state.body.lastDraw.results.find((r) => r.id === 'c').status, 'failed');

      const resend = await api.request('POST', `/api/draw/${drawn.body.drawId}/resend`, {
        participantId: 'c',
        email: 'carla.dias@exemplo.com',
      });
      assert.equal(resend.body.result.status, 'sent');
      assert.equal(mailer.sent.length, 4);
      assert.ok(mailer.sent.some((m) => m.to === 'carla.dias@exemplo.com'));

      // Os 4 emails formam um único ciclo (cada pessoa tirada uma vez).
      const names = participants.map((p) => p.name.toUpperCase());
      const drawnNames = mailer.sent.map((m) => names.find((n) => m.text.includes(`SEU AMIGO OCULTO É: ${n}`)));
      assert.equal(new Set(drawnNames).size, 4);

      const updated = await api.request('GET', `${groupPath}/state`);
      assert.equal(updated.body.lastDraw.sent, 4);
      assert.equal(updated.body.lastDraw.results.find((r) => r.id === 'c').email, 'carla.dias@exemplo.com');
    } finally {
      await api?.close();
      db?.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('converte o banco da versão com um único amigo oculto', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'amigo-oculto-'));
    const file = path.join(dir, 'legacy.db');
    try {
      const legacy = new DatabaseSync(file);
      legacy.exec(`
        CREATE TABLE participants (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL, position INTEGER NOT NULL);
        CREATE TABLE rules (
          id TEXT PRIMARY KEY, type TEXT NOT NULL CHECK (type IN ('block', 'force')),
          from_id TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
          to_id TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE, position INTEGER NOT NULL
        );
        CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
        CREATE TABLE draws (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, mode TEXT NOT NULL, event_json TEXT NOT NULL);
        CREATE TABLE draw_entries (
          draw_id TEXT NOT NULL REFERENCES draws(id) ON DELETE CASCADE, participant_id TEXT NOT NULL,
          position INTEGER NOT NULL, name TEXT NOT NULL, email TEXT NOT NULL, receiver_id TEXT NOT NULL,
          status TEXT NOT NULL CHECK (status IN ('pending', 'sent', 'failed')), error TEXT,
          PRIMARY KEY (draw_id, participant_id)
        );
        INSERT INTO participants VALUES ('a', 'Ana Souza', 'ana@exemplo.com', 0), ('b', 'Bruno Lima', 'bruno@exemplo.com', 1),
                                        ('c', 'Carla Dias', 'carla@exemplo.com', 2);
        INSERT INTO rules VALUES ('r1', 'block', 'a', 'b', 0);
        INSERT INTO settings VALUES ('event', '{"name":"Natal","date":"2026-12-24","budget":"","message":""}'),
                                    ('current_draw_id', 'd1');
        INSERT INTO draws VALUES ('d1', '2026-11-01T10:00:00.000Z', 'smtp', '{"name":"Natal"}');
        INSERT INTO draw_entries VALUES ('d1', 'a', 0, 'Ana Souza', 'ana@exemplo.com', 'c', 'sent', NULL),
                                        ('d1', 'b', 1, 'Bruno Lima', 'bruno@exemplo.com', 'a', 'sent', NULL),
                                        ('d1', 'c', 2, 'Carla Dias', 'carla@exemplo.com', 'b', 'failed', 'Mailbox unavailable');
      `);
      legacy.close();

      let db = openDatabase(file);
      const [group] = db.listGroups();
      assert.equal(db.listGroups().length, 1);
      assert.equal(group.event.name, 'Natal');
      assert.equal(group.createdAt, '2026-11-01T10:00:00.000Z');
      assert.deepEqual(
        { participants: group.participants, rules: group.rules },
        { participants: 3, rules: 1 },
      );
      assert.deepEqual(
        { drawId: group.draw.drawId, sent: group.draw.sent, failed: group.draw.failed },
        { drawId: 'd1', sent: 2, failed: 1 },
      );
      assert.equal(db.getDraw('d1').groupId, group.id);
      assert.equal(db.getState(group.id).rules[0].from, 'a');
      db.close();

      // Abrir de novo não migra outra vez nem duplica nada.
      db = openDatabase(file);
      assert.equal(db.listGroups().length, 1);
      assert.equal(db.getState(group.id).participants.length, 3);
      db.close();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
