import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { checkDraw, draw, DrawError } from '../src/draw.js';

const people = (n) =>
  Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, name: `Pessoa ${i + 1}`, email: `p${i + 1}@x.com` }));

/** Garante que o resultado é um único ciclo passando por todos. */
function assertSingleCycle(participants, assignments) {
  assert.equal(assignments.length, participants.length);

  const receiverOf = new Map(assignments.map((a) => [a.giverId, a.receiverId]));
  const givers = new Set(assignments.map((a) => a.giverId));
  const receivers = new Set(assignments.map((a) => a.receiverId));
  assert.equal(givers.size, participants.length, 'cada pessoa tira exatamente uma vez');
  assert.equal(receivers.size, participants.length, 'cada pessoa é tirada exatamente uma vez');

  for (const { giverId, receiverId } of assignments) {
    assert.notEqual(giverId, receiverId, 'ninguém tira a si mesmo');
  }

  // Percorre o ciclo a partir do primeiro: tem que voltar ao início só depois de passar por todos.
  const start = participants[0].id;
  let current = start;
  for (let step = 1; step <= participants.length; step++) {
    current = receiverOf.get(current);
    if (step < participants.length) assert.notEqual(current, start, 'formou um subciclo');
  }
  assert.equal(current, start, 'o ciclo fecha na primeira pessoa');
}

describe('draw()', () => {
  it('exige pelo menos 3 participantes', () => {
    assert.throws(() => draw(people(2)), DrawError);
  });

  it('forma sempre um único ciclo (sem "zebra")', () => {
    for (const n of [3, 4, 5, 10, 50]) {
      for (let run = 0; run < 50; run++) {
        assertSingleCycle(people(n), draw(people(n)));
      }
    }
  });

  it('é aleatório: com 4 pessoas, todos os 6 ciclos possíveis aparecem', () => {
    const seen = new Map();
    const runs = 3000;
    for (let i = 0; i < runs; i++) {
      const assignments = draw(people(4));
      const receiverOf = new Map(assignments.map((a) => [a.giverId, a.receiverId]));
      let key = 'p1';
      for (let cur = receiverOf.get('p1'); cur !== 'p1'; cur = receiverOf.get(cur)) key += `>${cur}`;
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }
    assert.equal(seen.size, 6);
    for (const count of seen.values()) {
      // Esperado ~500 cada. Margem larga para não ficar instável.
      assert.ok(count > 350 && count < 650, `distribuição desequilibrada: ${count}`);
    }
  });

  it('respeita bloqueios', () => {
    const participants = people(6);
    const rules = [
      { type: 'block', from: 'p1', to: 'p2' },
      { type: 'block', from: 'p1', to: 'p3' },
      { type: 'block', from: 'p4', to: 'p5' },
      { type: 'block', from: 'p6', to: 'p1' },
    ];
    for (let run = 0; run < 300; run++) {
      const result = draw(participants, rules);
      assertSingleCycle(participants, result);
      for (const rule of rules) {
        assert.ok(!result.some((a) => a.giverId === rule.from && a.receiverId === rule.to));
      }
    }
  });

  it('bloqueio é de mão única: bloquear A→B não impede B→A', () => {
    const participants = people(3);
    // Com 3 pessoas só existem 2 ciclos: p1→p2→p3→p1 e p1→p3→p2→p1.
    // Bloqueando p1→p2, o único possível é p1→p3→p2→p1, onde p2 tira p1.
    for (let run = 0; run < 50; run++) {
      const result = draw(participants, [{ type: 'block', from: 'p1', to: 'p2' }]);
      const receiverOf = new Map(result.map((a) => [a.giverId, a.receiverId]));
      assert.equal(receiverOf.get('p1'), 'p3');
      assert.equal(receiverOf.get('p2'), 'p1');
    }
  });

  it('respeita regras obrigatórias (inclusive encadeadas)', () => {
    const participants = people(8);
    const rules = [
      { type: 'force', from: 'p1', to: 'p5' },
      { type: 'force', from: 'p5', to: 'p3' },
      { type: 'force', from: 'p7', to: 'p2' },
      { type: 'block', from: 'p3', to: 'p4' },
    ];
    for (let run = 0; run < 300; run++) {
      const result = draw(participants, rules);
      assertSingleCycle(participants, result);
      const receiverOf = new Map(result.map((a) => [a.giverId, a.receiverId]));
      assert.equal(receiverOf.get('p1'), 'p5');
      assert.equal(receiverOf.get('p5'), 'p3');
      assert.equal(receiverOf.get('p7'), 'p2');
      assert.notEqual(receiverOf.get('p3'), 'p4');
    }
  });

  it('obrigatória é de mão única: A deve tirar B não força B a tirar A', () => {
    const participants = people(5);
    for (let run = 0; run < 100; run++) {
      const result = draw(participants, [{ type: 'force', from: 'p1', to: 'p2' }]);
      const receiverOf = new Map(result.map((a) => [a.giverId, a.receiverId]));
      assert.equal(receiverOf.get('p1'), 'p2');
      assert.notEqual(receiverOf.get('p2'), 'p1');
    }
  });

  it('aceita regras obrigatórias que definem o ciclo inteiro', () => {
    const participants = people(3);
    const rules = [
      { type: 'force', from: 'p1', to: 'p3' },
      { type: 'force', from: 'p3', to: 'p2' },
      { type: 'force', from: 'p2', to: 'p1' },
    ];
    const receiverOf = new Map(draw(participants, rules).map((a) => [a.giverId, a.receiverId]));
    assert.deepEqual(Object.fromEntries(receiverOf), { p1: 'p3', p3: 'p2', p2: 'p1' });
  });

  it('encontra a solução mesmo com regras muito restritivas', () => {
    // Cada pessoa só pode tirar a próxima "na roda", exceto uma alternativa.
    const participants = people(12);
    const rules = [];
    for (let i = 0; i < 12; i++) {
      for (let j = 0; j < 12; j++) {
        const allowed = j === (i + 1) % 12 || j === (i + 5) % 12;
        if (i !== j && !allowed) rules.push({ type: 'block', from: `p${i + 1}`, to: `p${j + 1}` });
      }
    }
    const result = draw(participants, rules);
    assertSingleCycle(participants, result);
  });

  describe('erros com mensagem clara', () => {
    const expectError = (participants, rules, pattern) =>
      assert.throws(() => draw(participants, rules), (err) => err instanceof DrawError && pattern.test(err.message));

    it('pessoa bloqueada de tirar todo mundo', () => {
      expectError(
        people(3),
        [
          { type: 'block', from: 'p1', to: 'p2' },
          { type: 'block', from: 'p1', to: 'p3' },
        ],
        /Não sobrou ninguém para Pessoa 1/,
      );
    });

    it('pessoa que ninguém pode tirar', () => {
      expectError(
        people(3),
        [
          { type: 'block', from: 'p2', to: 'p1' },
          { type: 'block', from: 'p3', to: 'p1' },
        ],
        /Ninguém consegue tirar Pessoa 1/,
      );
    });

    it('regra obrigatória e bloqueio contraditórios', () => {
      expectError(
        people(4),
        [
          { type: 'force', from: 'p1', to: 'p2' },
          { type: 'block', from: 'p1', to: 'p2' },
        ],
        /contraditórias/,
      );
    });

    it('duas obrigatórias para a mesma pessoa', () => {
      expectError(
        people(4),
        [
          { type: 'force', from: 'p1', to: 'p2' },
          { type: 'force', from: 'p1', to: 'p3' },
        ],
        /duas regras obrigatórias/,
      );
      expectError(
        people(4),
        [
          { type: 'force', from: 'p1', to: 'p3' },
          { type: 'force', from: 'p2', to: 'p3' },
        ],
        /Duas pessoas estão obrigadas a tirar Pessoa 3/,
      );
    });

    it('obrigatórias formando um ciclo menor (A tira B e B tira A)', () => {
      expectError(
        people(4),
        [
          { type: 'force', from: 'p1', to: 'p2' },
          { type: 'force', from: 'p2', to: 'p1' },
        ],
        /ciclo fechado/,
      );
    });

    it('obrigatórias que cobrem todos mas não conseguem fechar o ciclo', () => {
      expectError(
        people(3),
        [
          { type: 'force', from: 'p1', to: 'p2' },
          { type: 'force', from: 'p2', to: 'p3' },
          { type: 'block', from: 'p3', to: 'p1' },
        ],
        /fechar o ciclo/,
      );
    });

    it('combinação impossível detectada pela busca completa', () => {
      // p1 e p2 só podem tirar p3; p3 pode ser tirado por um só.
      expectError(
        people(4),
        [
          { type: 'block', from: 'p1', to: 'p2' },
          { type: 'block', from: 'p1', to: 'p4' },
          { type: 'block', from: 'p2', to: 'p1' },
          { type: 'block', from: 'p2', to: 'p4' },
        ],
        /Não existe nenhuma combinação possível/,
      );
    });

    it('regra com participante inexistente ou consigo mesmo', () => {
      expectError(people(3), [{ type: 'block', from: 'p1', to: 'p9' }], /não existe/);
      expectError(people(3), [{ type: 'block', from: 'p1', to: 'p1' }], /própria pessoa/);
    });
  });
});

describe('checkDraw()', () => {
  const entry = (id, receiverId) => ({ id, name: id.toUpperCase(), receiverId });

  it('aprova um ciclo único', () => {
    assert.deepEqual(checkDraw([entry('a', 'b'), entry('b', 'c'), entry('c', 'a')]), { ok: true, problems: [] });
  });

  it('aponta quem ficou sem ser tirado, quem foi tirado duas vezes e quem tirou a si mesmo', () => {
    const { ok, problems } = checkDraw([entry('a', 'b'), entry('b', 'b'), entry('c', 'a')]);
    assert.equal(ok, false);
    assert.ok(problems.includes('B tirou a si mesmo.'));
    assert.ok(problems.includes('Ninguém tirou C.'));
    assert.ok(problems.includes('B foi tirado por 2 pessoas.'));
  });

  it('aponta quando há grupos fechados em vez de um ciclo único', () => {
    const { ok, problems } = checkDraw([entry('a', 'b'), entry('b', 'a'), entry('c', 'd'), entry('d', 'c')]);
    assert.equal(ok, false);
    assert.match(problems[0], /ciclo único/);
  });
});
