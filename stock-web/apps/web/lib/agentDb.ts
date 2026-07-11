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
  role: "user" | "agent";
  content: string;
}

export interface DbSession {
  id: string;
  agentId: string;
  title: string;
  codexSid?: string;
  createdAt: number;
  updatedAt: number;
  messages: DbMessage[];
}

/** 查询某 agent 的所有会话（含消息），按 updated_at DESC */
export function listSessions(agentId: string): DbSession[] {
  const db = getDb();
  const sessions = db
    .prepare(
      `SELECT id, agent_id, title, codex_sid, created_at, updated_at
       FROM agent_session WHERE agent_id = ? ORDER BY updated_at DESC`,
    )
    .all(agentId) as {
    id: string;
    agent_id: string;
    title: string;
    codex_sid: string | null;
    created_at: number;
    updated_at: number;
  }[];

  return sessions.map((s) => {
    const messages = db
      .prepare(
        `SELECT role, content FROM agent_message WHERE session_id = ? ORDER BY id ASC`,
      )
      .all(s.id) as DbMessage[];
    return {
      id: s.id,
      agentId: s.agent_id,
      title: s.title,
      codexSid: s.codex_sid ?? undefined,
      createdAt: s.created_at,
      updatedAt: s.updated_at,
      messages,
    };
  });
}

/** 创建或完整替换一个会话（含消息）—— upsert session + replace messages */
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
    // 删旧消息，重写（简单可靠）
    db.prepare(`DELETE FROM agent_message WHERE session_id = ?`).run(session.id);
    const insertMsg = db.prepare(
      `INSERT INTO agent_message(session_id, role, content, created_at) VALUES(?,?,?,?)`,
    );
    for (const msg of session.messages) {
      insertMsg.run(session.id, msg.role, msg.content, now);
    }
  })();
}

/** 删除一个会话（消息级联删除） */
export function deleteSession(sessionId: string): void {
  getDb().prepare(`DELETE FROM agent_session WHERE id = ?`).run(sessionId);
}
