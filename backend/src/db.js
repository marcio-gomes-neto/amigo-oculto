import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

/**
 * Banco de dados SQLite: tudo fica em um único arquivo (por padrão backend/data/amigo-oculto.db).
 *
 * Guarda:
 *  - participantes, regras e detalhes do evento (o que você está montando no app);
 *  - os sorteios realizados, para poder reenviar um email sem refazer o sorteio.
 *
 * ⚠️ A tabela draw_entries contém quem tirou quem. A API nunca devolve essa
 * informação, mas quem abrir o arquivo do banco consegue ver. Se você também
 * participa, não abra o arquivo. 😉
 */

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS participants (
    id       TEXT PRIMARY KEY,
    name     TEXT NOT NULL,
    email    TEXT NOT NULL,
    position INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS rules (
    id       TEXT PRIMARY KEY,
    type     TEXT NOT NULL CHECK (type IN ('block', 'force')),
    from_id  TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
    to_id    TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
    position INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS draws (
    id         TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    mode       TEXT NOT NULL,
    event_json TEXT NOT NULL
  );

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

const EMPTY_EVENT = { name: '', date: '', budget: '', message: '' };

export function openDatabase(file = ':memory:') {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });

  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
  db.exec(SCHEMA);

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

  const sql = {
    listParticipants: db.prepare('SELECT id, name, email FROM participants ORDER BY position'),
    listRules: db.prepare('SELECT id, type, from_id AS "from", to_id AS "to" FROM rules ORDER BY position'),
    deleteParticipants: db.prepare('DELETE FROM participants'),
    deleteRules: db.prepare('DELETE FROM rules'),
    insertParticipant: db.prepare(
      'INSERT INTO participants (id, name, email, position) VALUES (:id, :name, :email, :position)',
    ),
    insertRule: db.prepare(
      'INSERT INTO rules (id, type, from_id, to_id, position) VALUES (:id, :type, :from, :to, :position)',
    ),
    getSetting: db.prepare('SELECT value FROM settings WHERE key = ?'),
    setSetting: db.prepare(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    ),
    deleteSetting: db.prepare('DELETE FROM settings WHERE key = ?'),
    insertDraw: db.prepare(
      'INSERT INTO draws (id, created_at, mode, event_json) VALUES (:id, :createdAt, :mode, :eventJson)',
    ),
    insertEntry: db.prepare(
      `INSERT INTO draw_entries (draw_id, participant_id, position, name, email, receiver_id, status)
       VALUES (:drawId, :participantId, :position, :name, :email, :receiverId, 'pending')`,
    ),
    getDraw: db.prepare('SELECT id, created_at AS createdAt, mode, event_json AS eventJson FROM draws WHERE id = ?'),
    listEntries: db.prepare(
      `SELECT participant_id AS id, name, email, receiver_id AS receiverId, status, error
       FROM draw_entries WHERE draw_id = ? ORDER BY position`,
    ),
    updateEntry: db.prepare(
      `UPDATE draw_entries SET email = :email, status = :status, error = :error
       WHERE draw_id = :drawId AND participant_id = :participantId`,
    ),
  };

  const getSetting = (key) => sql.getSetting.get(key)?.value;

  /** Monta o sorteio com os pares (uso interno do servidor). */
  function getDraw(id) {
    const draw = id && sql.getDraw.get(id);
    if (!draw) return null;
    return {
      id: draw.id,
      createdAt: draw.createdAt,
      mode: draw.mode,
      event: JSON.parse(draw.eventJson),
      entries: sql.listEntries.all(id).map((entry) => ({ ...entry, error: entry.error ?? undefined })),
    };
  }

  return {
    /** Participantes, regras e evento que estão sendo montados no app. */
    getState() {
      const event = getSetting('event');
      return {
        participants: sql.listParticipants.all().map((p) => ({ ...p })),
        rules: sql.listRules.all().map((r) => ({ ...r })),
        event: event ? { ...EMPTY_EVENT, ...JSON.parse(event) } : { ...EMPTY_EVENT },
      };
    },

    /** Substitui participantes, regras e evento de uma vez (em uma transação). */
    saveState({ participants, rules, event }) {
      transaction(() => {
        sql.deleteRules.run();
        sql.deleteParticipants.run();
        participants.forEach((p, position) => sql.insertParticipant.run({ ...p, position }));
        rules.forEach((r, position) =>
          sql.insertRule.run({ id: r.id ?? randomUUID(), type: r.type, from: r.from, to: r.to, position }),
        );
        sql.setSetting.run('event', JSON.stringify(event ?? EMPTY_EVENT));
      });
    },

    /**
     * Registra um sorteio (todos os envios começam como "pending") e o marca como atual.
     * @param {{ participants: object[], receiverOf: Map<string,string>, event: object, mode: string }} data
     */
    createDraw({ participants, receiverOf, event, mode }) {
      const id = randomUUID();
      const createdAt = new Date().toISOString();
      transaction(() => {
        sql.insertDraw.run({ id, createdAt, mode, eventJson: JSON.stringify(event ?? {}) });
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
        sql.setSetting.run('current_draw_id', id);
      });
      return getDraw(id);
    },

    getDraw,

    /** Sorteio exibido na tela (o último realizado, até você preparar um novo). */
    getCurrentDraw() {
      return getDraw(getSetting('current_draw_id'));
    },

    clearCurrentDraw() {
      sql.deleteSetting.run('current_draw_id');
    },

    updateEntry(drawId, participantId, { email, status, error }) {
      sql.updateEntry.run({ drawId, participantId, email, status, error: error ?? null });
    },

    close() {
      db.close();
    },
  };
}
