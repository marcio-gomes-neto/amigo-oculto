import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

/**
 * Banco de dados SQLite: tudo fica em um único arquivo (por padrão backend/data/amigo-oculto.db).
 *
 * Guarda vários amigos ocultos (tabela groups). Cada um tem:
 *  - participantes, regras e detalhes do evento (o que você está montando no app);
 *  - os sorteios realizados, para poder reenviar um email sem refazer o sorteio.
 *
 * ⚠️ A tabela draw_entries contém quem tirou quem. A API nunca devolve essa
 * informação, mas quem abrir o arquivo do banco consegue ver. Se você também
 * participa, não abra o arquivo. 😉
 */

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS groups (
    id              TEXT PRIMARY KEY,
    created_at      TEXT NOT NULL,
    event_json      TEXT NOT NULL,
    current_draw_id TEXT
  );

  CREATE TABLE IF NOT EXISTS participants (
    group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    id       TEXT NOT NULL,
    name     TEXT NOT NULL,
    email    TEXT NOT NULL,
    position INTEGER NOT NULL,
    PRIMARY KEY (group_id, id)
  );

  CREATE TABLE IF NOT EXISTS rules (
    group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    id       TEXT NOT NULL,
    type     TEXT NOT NULL CHECK (type IN ('block', 'force')),
    from_id  TEXT NOT NULL,
    to_id    TEXT NOT NULL,
    position INTEGER NOT NULL,
    PRIMARY KEY (group_id, id),
    FOREIGN KEY (group_id, from_id) REFERENCES participants(group_id, id) ON DELETE CASCADE,
    FOREIGN KEY (group_id, to_id) REFERENCES participants(group_id, id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS draws (
    id         TEXT PRIMARY KEY,
    group_id   TEXT REFERENCES groups(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    mode       TEXT NOT NULL,
    event_json TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS draws_group_id ON draws(group_id);

  CREATE TABLE IF NOT EXISTS draw_entries (
    draw_id        TEXT NOT NULL REFERENCES draws(id) ON DELETE CASCADE,
    participant_id TEXT NOT NULL,
    position       INTEGER NOT NULL,
    name           TEXT NOT NULL,
    email          TEXT NOT NULL,
    receiver_id    TEXT NOT NULL,
    status         TEXT NOT NULL CHECK (status IN ('pending', 'sent', 'failed')),
    error          TEXT,
    PRIMARY KEY (draw_id, participant_id)
  );
`;

export const EMPTY_EVENT = { name: '', date: '', budget: '', message: '' };

const parseEventJson = (json) => ({ ...EMPTY_EVENT, ...JSON.parse(json) });

/**
 * A primeira versão do app guardava um único amigo oculto (participantes e regras
 * sem grupo, evento e sorteio atual na tabela settings). Converte esse banco para
 * o formato com grupos, transformando o que existia no primeiro amigo oculto.
 */
function migrateSingleGroupSchema(db, transaction) {
  const columns = db.prepare('PRAGMA table_info(participants)').all();
  if (columns.length === 0 || columns.some((c) => c.name === 'group_id')) return;

  db.exec('PRAGMA foreign_keys = OFF');
  try {
    transaction(() => {
      db.exec(`
        ALTER TABLE rules RENAME TO legacy_rules;
        ALTER TABLE participants RENAME TO legacy_participants;
        ALTER TABLE draws ADD COLUMN group_id TEXT REFERENCES groups(id) ON DELETE CASCADE;
      `);
      db.exec(SCHEMA);

      const setting = (key) => db.prepare('SELECT value FROM settings WHERE key = ?').get(key)?.value;
      const count = (table) => db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
      const event = setting('event') ?? JSON.stringify(EMPTY_EVENT);
      const hasData = count('legacy_participants') > 0 || count('draws') > 0 || Boolean(JSON.parse(event).name);

      if (hasData) {
        const groupId = randomUUID();
        const firstDraw = db.prepare('SELECT MIN(created_at) AS createdAt FROM draws').get().createdAt;
        db.prepare('INSERT INTO groups (id, created_at, event_json, current_draw_id) VALUES (?, ?, ?, ?)').run(
          groupId,
          firstDraw ?? new Date().toISOString(),
          event,
          setting('current_draw_id') ?? null,
        );
        db.prepare(
          `INSERT INTO participants (group_id, id, name, email, position)
           SELECT ?, id, name, email, position FROM legacy_participants`,
        ).run(groupId);
        db.prepare(
          `INSERT INTO rules (group_id, id, type, from_id, to_id, position)
           SELECT ?, id, type, from_id, to_id, position FROM legacy_rules`,
        ).run(groupId);
        db.prepare('UPDATE draws SET group_id = ?').run(groupId);
      }

      db.exec('DROP TABLE legacy_rules; DROP TABLE legacy_participants; DROP TABLE settings;');
    });
  } finally {
    db.exec('PRAGMA foreign_keys = ON');
  }
}

export function openDatabase(file = ':memory:') {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });

  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');

  const transaction = (fn) => {
    db.exec('BEGIN');
    try {
      const result = fn();
      db.exec('COMMIT');
      return result;
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  };

  migrateSingleGroupSchema(db, transaction);
  db.exec(SCHEMA);

  const sql = {
    listGroups: db.prepare(
      `SELECT g.id, g.created_at AS createdAt, g.event_json AS eventJson,
              (SELECT COUNT(*) FROM participants p WHERE p.group_id = g.id) AS participants,
              (SELECT COUNT(*) FROM rules r WHERE r.group_id = g.id) AS rules,
              d.id AS drawId, d.created_at AS drawnAt,
              (SELECT COUNT(*) FROM draw_entries e WHERE e.draw_id = d.id) AS total,
              (SELECT COUNT(*) FROM draw_entries e WHERE e.draw_id = d.id AND e.status = 'sent') AS sent,
              (SELECT COUNT(*) FROM draw_entries e WHERE e.draw_id = d.id AND e.status = 'failed') AS failed
       FROM groups g
       LEFT JOIN draws d ON d.id = g.current_draw_id
       ORDER BY g.created_at DESC`,
    ),
    getGroup: db.prepare(
      'SELECT id, created_at AS createdAt, event_json AS eventJson, current_draw_id AS currentDrawId FROM groups WHERE id = ?',
    ),
    insertGroup: db.prepare('INSERT INTO groups (id, created_at, event_json) VALUES (:id, :createdAt, :eventJson)'),
    deleteGroup: db.prepare('DELETE FROM groups WHERE id = ?'),
    setGroupEvent: db.prepare('UPDATE groups SET event_json = ? WHERE id = ?'),
    setCurrentDraw: db.prepare('UPDATE groups SET current_draw_id = ? WHERE id = ?'),
    listParticipants: db.prepare('SELECT id, name, email FROM participants WHERE group_id = ? ORDER BY position'),
    listRules: db.prepare(
      'SELECT id, type, from_id AS "from", to_id AS "to" FROM rules WHERE group_id = ? ORDER BY position',
    ),
    deleteParticipants: db.prepare('DELETE FROM participants WHERE group_id = ?'),
    deleteRules: db.prepare('DELETE FROM rules WHERE group_id = ?'),
    copyParticipants: db.prepare(
      `INSERT INTO participants (group_id, id, name, email, position)
       SELECT :to, id, name, email, position FROM participants WHERE group_id = :from`,
    ),
    copyRules: db.prepare(
      `INSERT INTO rules (group_id, id, type, from_id, to_id, position)
       SELECT :to, id, type, from_id, to_id, position FROM rules WHERE group_id = :from`,
    ),
    insertParticipant: db.prepare(
      'INSERT INTO participants (group_id, id, name, email, position) VALUES (:groupId, :id, :name, :email, :position)',
    ),
    insertRule: db.prepare(
      `INSERT INTO rules (group_id, id, type, from_id, to_id, position)
       VALUES (:groupId, :id, :type, :from, :to, :position)`,
    ),
    insertDraw: db.prepare(
      `INSERT INTO draws (id, group_id, created_at, mode, event_json)
       VALUES (:id, :groupId, :createdAt, :mode, :eventJson)`,
    ),
    insertEntry: db.prepare(
      `INSERT INTO draw_entries (draw_id, participant_id, position, name, email, receiver_id, status)
       VALUES (:drawId, :participantId, :position, :name, :email, :receiverId, 'pending')`,
    ),
    getDraw: db.prepare(
      'SELECT id, group_id AS groupId, created_at AS createdAt, mode, event_json AS eventJson FROM draws WHERE id = ?',
    ),
    listDrawIds: db.prepare('SELECT id FROM draws WHERE group_id = ? ORDER BY created_at DESC'),
    listEntries: db.prepare(
      `SELECT participant_id AS id, name, email, receiver_id AS receiverId, status, error
       FROM draw_entries WHERE draw_id = ? ORDER BY position`,
    ),
    updateEntry: db.prepare(
      `UPDATE draw_entries SET email = :email, status = :status, error = :error
       WHERE draw_id = :drawId AND participant_id = :participantId`,
    ),
  };

  /** Monta o sorteio com os pares (uso interno do servidor). */
  function getDraw(id) {
    const draw = id && sql.getDraw.get(id);
    if (!draw) return null;
    return {
      id: draw.id,
      groupId: draw.groupId,
      createdAt: draw.createdAt,
      mode: draw.mode,
      event: JSON.parse(draw.eventJson),
      entries: sql.listEntries.all(id).map((entry) => ({ ...entry, error: entry.error ?? undefined })),
    };
  }

  function getGroup(id) {
    const group = id && sql.getGroup.get(id);
    if (!group) return null;
    return { id: group.id, createdAt: group.createdAt, event: parseEventJson(group.eventJson), currentDrawId: group.currentDrawId };
  }

  return {
    /** Todos os amigos ocultos, do mais novo para o mais antigo, com contagens e resumo do sorteio atual. */
    listGroups() {
      return sql.listGroups.all().map((row) => ({
        id: row.id,
        createdAt: row.createdAt,
        event: parseEventJson(row.eventJson),
        participants: row.participants,
        rules: row.rules,
        draw: row.drawId
          ? { drawId: row.drawId, createdAt: row.drawnAt, total: row.total, sent: row.sent, failed: row.failed }
          : null,
      }));
    },

    getGroup,

    createGroup({ event } = {}) {
      const id = randomUUID();
      sql.insertGroup.run({
        id,
        createdAt: new Date().toISOString(),
        eventJson: JSON.stringify({ ...EMPTY_EVENT, ...event }),
      });
      return getGroup(id);
    },

    /** Cria um novo amigo oculto (sem sorteio) com os mesmos participantes e regras de outro. */
    duplicateGroup(groupId, { event }) {
      const id = randomUUID();
      transaction(() => {
        sql.insertGroup.run({
          id,
          createdAt: new Date().toISOString(),
          eventJson: JSON.stringify({ ...EMPTY_EVENT, ...event }),
        });
        sql.copyParticipants.run({ to: id, from: groupId });
        sql.copyRules.run({ to: id, from: groupId });
      });
      return getGroup(id);
    },

    /** Apaga o amigo oculto com participantes, regras e sorteios. Retorna false se ele não existia. */
    deleteGroup(id) {
      return sql.deleteGroup.run(id).changes > 0;
    },

    /** Participantes, regras e evento que estão sendo montados no app. */
    getState(groupId) {
      const group = getGroup(groupId);
      if (!group) return null;
      return {
        participants: sql.listParticipants.all(groupId).map((p) => ({ ...p })),
        rules: sql.listRules.all(groupId).map((r) => ({ ...r })),
        event: group.event,
      };
    },

    /** Substitui participantes, regras e evento de uma vez (em uma transação). */
    saveState(groupId, { participants, rules, event }) {
      transaction(() => {
        sql.deleteRules.run(groupId);
        sql.deleteParticipants.run(groupId);
        participants.forEach((p, position) => sql.insertParticipant.run({ groupId, ...p, position }));
        rules.forEach((r, position) =>
          sql.insertRule.run({ groupId, id: r.id ?? randomUUID(), type: r.type, from: r.from, to: r.to, position }),
        );
        sql.setGroupEvent.run(JSON.stringify({ ...EMPTY_EVENT, ...event }), groupId);
      });
    },

    /**
     * Registra um sorteio (todos os envios começam como "pending") e o marca como atual do amigo oculto.
     * @param {{ groupId: string, participants: object[], receiverOf: Map<string,string>, event: object, mode: string }} data
     */
    createDraw({ groupId, participants, receiverOf, event, mode }) {
      const id = randomUUID();
      const createdAt = new Date().toISOString();
      transaction(() => {
        sql.insertDraw.run({ id, groupId, createdAt, mode, eventJson: JSON.stringify(event ?? {}) });
        participants.forEach((p, position) =>
          sql.insertEntry.run({
            drawId: id,
            participantId: p.id,
            position,
            name: p.name,
            email: p.email,
            receiverId: receiverOf.get(p.id),
          }),
        );
        sql.setCurrentDraw.run(id, groupId);
      });
      return getDraw(id);
    },

    getDraw,

    /** Todos os sorteios do amigo oculto, do mais recente para o mais antigo (com os pares — uso interno). */
    listDraws(groupId) {
      return sql.listDrawIds.all(groupId).map(({ id }) => getDraw(id));
    },

    /** O sorteio do amigo oculto (cada amigo oculto tem no máximo um). */
    getCurrentDraw(groupId) {
      return getDraw(getGroup(groupId)?.currentDrawId);
    },

    updateEntry(drawId, participantId, { email, status, error }) {
      sql.updateEntry.run({ drawId, participantId, email, status, error: error ?? null });
    },

    close() {
      db.close();
    },
  };
}
