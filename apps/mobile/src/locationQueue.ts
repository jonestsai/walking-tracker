import * as SQLite from "expo-sqlite";
import type { FixPayload } from "./api";

const database = SQLite.openDatabaseSync("walkingatlas.db");

export function initialiseQueue(): void {
  database.execSync(`
    create table if not exists active_walk (
      singleton integer primary key check (singleton = 1),
      session_id text not null,
      started_at integer
    );
    create table if not exists queued_fixes (
      id integer primary key autoincrement,
      session_id text not null,
      payload text not null
    );
  `);
  try {
    database.execSync("alter table active_walk add column started_at integer");
  } catch {
    // Existing installs already have this column after the first migration run.
  }
}

export function setActiveWalk(sessionId: string, startedAt = Date.now()): void {
  database.runSync("insert or replace into active_walk (singleton, session_id, started_at) values (1, ?, ?)", sessionId, startedAt);
}

export function activeWalk(): string | null {
  return database.getFirstSync<{ session_id: string }>("select session_id from active_walk where singleton = 1")?.session_id ?? null;
}

export function activeWalkStartedAt(): number | null {
  return database.getFirstSync<{ started_at: number | null }>("select started_at from active_walk where singleton = 1")?.started_at ?? null;
}

export function clearActiveWalk(): void {
  database.runSync("delete from active_walk where singleton = 1");
}

export function clearAllLocalWalkData(): void {
  database.execSync("delete from queued_fixes; delete from active_walk;");
}

export function enqueueFixes(sessionId: string, fixes: FixPayload[]): void {
  for (const fix of fixes) {
    database.runSync("insert into queued_fixes (session_id, payload) values (?, ?)", sessionId, JSON.stringify(fix));
  }
}

export function nextBatch(sessionId: string, limit = 50): Array<{ id: number; fix: FixPayload }> {
  return database
    .getAllSync<{ id: number; payload: string }>("select id, payload from queued_fixes where session_id = ? order by id limit ?", sessionId, limit)
    .map((row) => ({ id: row.id, fix: JSON.parse(row.payload) as FixPayload }));
}

export function removeBatch(ids: number[]): void {
  if (ids.length === 0) return;
  database.runSync(`delete from queued_fixes where id in (${ids.map(() => "?").join(",")})`, ...ids);
}
