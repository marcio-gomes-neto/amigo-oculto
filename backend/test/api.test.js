import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
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

  beforeEach(() => {
    mailer.sent = [];
    mailer.failFor = new Set();
    mailer.verifyError = null;
  });

  const post = (path, body) => api.request('POST', path, body);

  it('GET/PUT /api/state salva e devolve participantes, regras e evento', async () => {
    const empty = await api.request('GET', '/api/state');
    assert.equal(empty.status, 200);
    assert.deepEqual(empty.body.participants, []);
    assert.deepEqual(empty.body.rules, []);
    assert.equal(empty.body.lastDraw, null);

    const state = {
      participants: participants.slice(0, 2),
      rules: [{ id: 'r1', type: 'block', from: 'a', to: 'b' }],
      event: { name: 'Natal', date: '2026-12-24', budget: 'R$ 50', message: '' },
    };
    const saved = await api.request('PUT', '/api/state', state);
    assert.equal(saved.status, 200);

    const loaded = await api.request('GET', '/api/state');
    assert.deepEqual(loaded.body.participants, state.participants);
    assert.deepEqual(loaded.body.rules, state.rules);
    assert.deepEqual(loaded.body.event, state.event);

    // Regra apontando para alguém que não existe é recusada (e nada é alterado).
    const invalid = await api.request('PUT', '/api/state', {
      participants: participants.slice(0, 1),
      rules: [{ id: 'r1', type: 'block', from: 'a', to: 'b' }],
    });
    assert.equal(invalid.status, 400);
    assert.equal((await api.request('GET', '/api/state')).body.participants.length, 2);

    await api.request('PUT', '/api/state', { participants: [], rules: [] });
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
    const res = await post('/api/draw', {
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

  it('valida o payload (nomes e emails repetidos, emails inválidos)', async () => {
    const dupName = await post('/api/draw', {
      participants: [...participants, { id: 'e', name: 'ana souza', email: 'outra@exemplo.com' }],
    });
    assert.equal(dupName.status, 400);
    assert.match(dupName.body.error, /dois participantes chamados/);

    const dupEmail = await post('/api/draw', {
      participants: [...participants, { id: 'e', name: 'Eva', email: 'ANA@exemplo.com' }],
    });
    assert.equal(dupEmail.status, 400);

    const badEmail = await post('/api/draw', {
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
    const res = await post('/api/draw', { participants, rules, event: { name: 'Natal 2026', budget: 'R$ 50' } });
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

  it('não envia nada se a conexão com o servidor de email falhar', async () => {
    mailer.verifyError = new Error('Invalid login');
    const res = await post('/api/draw', { participants });
    assert.equal(res.status, 502);
    assert.match(res.body.error, /Invalid login/);
    assert.match(res.body.error, /Nenhum email foi enviado/);
    assert.equal(mailer.sent.length, 0);
  });

  it('permite reenviar para quem falhou, corrigindo o email, sem refazer o sorteio', async () => {
    mailer.failFor.add('bruno@exemplo.com');
    const res = await post('/api/draw', { participants });
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

  it('o último sorteio aparece no estado (sem revelar pares) até preparar um novo', async () => {
    const res = await post('/api/draw', { participants });
    assert.equal(res.status, 201);

    const state = await api.request('GET', '/api/state');
    assert.equal(state.body.lastDraw.drawId, res.body.drawId);
    assert.equal(state.body.lastDraw.sent, 4);
    assert.ok(!/receiver/i.test(JSON.stringify(state.body)));

    const cleared = await api.request('DELETE', '/api/draw/current');
    assert.equal(cleared.status, 200);
    assert.equal((await api.request('GET', '/api/state')).body.lastDraw, null);

    // O sorteio continua no banco: ainda dá para reenviar.
    const resend = await post(`/api/draw/${res.body.drawId}/resend`, { participantId: 'a' });
    assert.equal(resend.body.result.status, 'sent');
  });

  it('GET /api/email/preview renderiza o template', async () => {
    const res = await fetch(`${baseUrl}/api/email/preview?name=${encodeURIComponent('Natal <b>')}`);
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.match(html, /Seu amigo oculto é/);
    assert.match(html, /Natal &lt;b&gt;/);
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
      await api.request('PUT', '/api/state', { participants, rules: [], event: { name: 'Natal' } });
      const drawn = await api.request('POST', '/api/draw', { participants, event: { name: 'Natal' } });
      assert.equal(drawn.body.failed, 1);
      await api.close();
      db.close();

      // Segunda "execução": tudo continua lá e o reenvio usa o MESMO sorteio.
      mailer.failFor.clear();
      db = openDatabase(file);
      api = await startServer({ mailer, db });
      const state = await api.request('GET', '/api/state');
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

      const updated = await api.request('GET', '/api/state');
      assert.equal(updated.body.lastDraw.sent, 4);
      assert.equal(updated.body.lastDraw.results.find((r) => r.id === 'c').email, 'carla.dias@exemplo.com');
    } finally {
      await api?.close();
      db?.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
