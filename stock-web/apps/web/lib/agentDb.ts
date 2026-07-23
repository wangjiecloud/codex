/**
 * agentDb.ts
 * Agent 会话持久化到 SQLite（stock_data.db）
 * 表结构在首次调用时自动创建（IF NOT EXISTS）
 */
import Database from "better-sqlite3";
import * as path from "path";
import * as os from "os";

const DB_PATH =
  process.env.STOCK_DB_PATH ||
  path.join(
    os.homedir(),
    "codespace/self/SuperJAI/oss/agent/codex/stock-web/apps/data-service/stock_data.db",
  );

let _db: Database.Database | null = null;

function getDb(): Database.Database {
  if (_db) return _db;
  _db = new Database(DB_PATH);
  _db.pragma("journal_mode = WAL");
  _db.exec(`
    CREATE TABLE IF NOT EXISTS agent_session (
      id          TEXT PRIMARY KEY,
      agent_id    TEXT NOT NULL,
      title       TEXT NOT NULL DEFAULT '新会话',
      codex_sid   TEXT,
      created_at  INTEGER NOT NULL,
      updated_at  INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS agent_message (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id  TEXT NOT NULL REFERENCES agent_session(id) ON DELETE CASCADE,
      role        TEXT NOT NULL CHECK(role IN ('user','agent')),
      content     TEXT NOT NULL DEFAULT '',
      created_at  INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_agent_message_session ON agent_message(session_id, id);
    CREATE INDEX IF NOT EXISTS idx_agent_session_agent ON agent_session(agent_id, updated_at DESC);
  `);
  return _db;
}

export interface DbMessage {
  id?: number;
  role: "user" | "agent";
  content: string;
}

export interface DbSessionSummary {
  id: string;
  agentId: string;
  title: string;
  codexSid?: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
}

export interface DbSession extends DbSessionSummary {
  messages: DbMessage[];
}

export function listSessions(agentId: string): DbSessionSummary[] {
  const db = getDb();
  const sessions = db
    .prepare(
      `SELECT s.id, s.agent_id, s.title, s.codex_sid, s.created_at, s.updated_at,
              COUNT(m.id) AS message_count
       FROM agent_session s
       LEFT JOIN agent_message m ON m.session_id = s.id
       WHERE s.agent_id = ?
       GROUP BY s.id, s.agent_id, s.title, s.codex_sid, s.created_at, s.updated_at
       ORDER BY s.updated_at DESC`,
    )
    .all(agentId) as {
    id: string;
    agent_id: string;
    title: string;
    codex_sid: string | null;
    created_at: number;
    updated_at: number;
    message_count: number;
  }[];

  return sessions.map((s) => ({
    id: s.id,
    agentId: s.agent_id,
    title: s.title,
    codexSid: s.codex_sid ?? undefined,
    createdAt: s.created_at,
    updatedAt: s.updated_at,
    messageCount: s.message_count,
  }));
}

export function listSessionMessages(
  sessionId: string,
  offset = 0,
  limit = 30,
): { messages: DbMessage[]; total: number } {
  const db = getDb();
  const row = db
    .prepare(`SELECT COUNT(*) AS total FROM agent_message WHERE session_id = ?`)
    .get(sessionId) as { total: number } | undefined;
  const total = row?.total ?? 0;
  const safeOffset = Math.max(0, offset);
  const safeLimit = Math.max(1, limit);
  const messages = db
    .prepare(
      `SELECT id, role, content
       FROM agent_message
       WHERE session_id = ?
       ORDER BY id DESC
       LIMIT ? OFFSET ?`,
    )
    .all(sessionId, safeLimit, safeOffset) as {
    id: number;
    role: "user" | "agent";
    content: string;
  }[];

  return {
    total,
    messages: messages.reverse().map((msg) => ({
      id: msg.id,
      role: msg.role,
      content: msg.content,
    })),
  };
}

export function upsertSession(session: DbSession): void {
  const db = getDb();
  const now = Date.now();
  db.transaction(() => {
    db.prepare(
      `INSERT INTO agent_session(id, agent_id, title, codex_sid, created_at, updated_at)
       VALUES(?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET
         title=excluded.title,
         codex_sid=excluded.codex_sid,
         updated_at=excluded.updated_at`,
    ).run(
      session.id,
      session.agentId,
      session.title,
      session.codexSid ?? null,
      session.createdAt,
      now,
    );
    db.prepare(`DELETE FROM agent_message WHERE session_id = ?`).run(
      session.id,
    );
    const insertMsg = db.prepare(
      `INSERT INTO agent_message(session_id, role, content, created_at) VALUES(?,?,?,?)`,
    );
    for (const msg of session.messages) {
      insertMsg.run(session.id, msg.role, msg.content, now);
    }
  })();
}

export function deleteSession(sessionId: string): void {
  getDb().prepare(`DELETE FROM agent_session WHERE id = ?`).run(sessionId);
}
