import { createRequire } from "node:module";
import type BetterSqlite3 from "better-sqlite3";

const require = createRequire(import.meta.url);

export interface QueryHandle<T, P extends unknown[]> {
  get(...params: P): T | null;
  all(...params: P): T[];
}

export interface StatementHandle {
  run(...params: unknown[]): unknown;
}

export interface DatabaseLike {
  exec(sql: string): void;
  run(sql: string, params?: unknown[]): unknown;
  query<T, P extends unknown[]>(sql: string): QueryHandle<T, P>;
  prepare(sql: string): StatementHandle;
  transaction<T>(fn: () => T): () => T;
  close(): void;
}

class BetterSqliteStatement implements StatementHandle {
  constructor(private readonly stmt: BetterSqlite3.Statement) {}

  run(...params: unknown[]): unknown {
    return this.stmt.run(...params);
  }
}

class BetterSqliteQuery<T, P extends unknown[]> implements QueryHandle<T, P> {
  constructor(private readonly stmt: BetterSqlite3.Statement) {}

  get(...params: P): T | null {
    return (this.stmt.get(...params) as T | undefined) ?? null;
  }

  all(...params: P): T[] {
    return this.stmt.all(...params) as T[];
  }
}

class NodeSqliteDatabase implements DatabaseLike {
  private readonly db: BetterSqlite3.Database;

  constructor(path: string) {
    const BetterSqlite3Module = require("better-sqlite3") as typeof import("better-sqlite3");
    this.db = new BetterSqlite3Module(path);
  }

  exec(sql: string): void {
    this.db.exec(sql);
  }

  run(sql: string, params: unknown[] = []): unknown {
    return this.db.prepare(sql).run(...params);
  }

  query<T, P extends unknown[]>(sql: string): QueryHandle<T, P> {
    return new BetterSqliteQuery<T, P>(this.db.prepare(sql));
  }

  prepare(sql: string): StatementHandle {
    return new BetterSqliteStatement(this.db.prepare(sql));
  }

  transaction<T>(fn: () => T): () => T {
    return this.db.transaction(fn);
  }

  close(): void {
    this.db.close();
  }
}

export function createDatabase(path: string): DatabaseLike {
  return new NodeSqliteDatabase(path);
}
