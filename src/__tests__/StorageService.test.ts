/**
 * StorageService tests — uses a focused in-memory fake for expo-sqlite that
 * handles the exact SQL patterns StorageService emits. Tests are deterministic
 * and run without a device or simulator.
 */

// ── Minimal in-memory SQLite fake ─────────────────────────────────────────────

type BindValue = string | number | boolean | null | undefined;
type Row = Record<string, BindValue>;

class FakeDatabase {
  /** All table data, keyed by lower-case table name. */
  readonly tables: Map<string, Row[]> = new Map();

  // ── Public expo-sqlite async API ─────────────────────────────────────────

  async execAsync(sql: string): Promise<void> {
    for (const stmt of this._split(sql)) this._exec(stmt, []);
  }

  async runAsync(sql: string, params: BindValue[] = []): Promise<void> {
    this._exec(sql, params);
  }

  async getFirstAsync<T>(sql: string, params: BindValue[] = []): Promise<T | null> {
    const rows = this._select(sql, params);
    return rows.length ? (rows[0] as unknown as T) : null;
  }

  async getAllAsync<T>(sql: string, params: BindValue[] = []): Promise<T[]> {
    return this._select(sql, params) as unknown as T[];
  }

  async withTransactionAsync(cb: () => Promise<void>): Promise<void> {
    await cb();
  }

  async closeAsync(): Promise<void> {
    this.tables.clear();
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private _split(sql: string): string[] {
    return sql
      .split(';')
      .map((s) => s.replace(/\s+/g, ' ').trim())
      .filter(Boolean);
  }

  private _tbl(name: string): Row[] {
    const key = name.toLowerCase();
    if (!this.tables.has(key)) this.tables.set(key, []);
    return this.tables.get(key)!;
  }

  private _exec(sql: string, params: BindValue[]): void {
    const up = sql.trimStart().toUpperCase();
    if (up.startsWith('CREATE') || up.startsWith('PRAGMA')) {
      // Ensure table exists in store.
      const m = sql.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)/i);
      if (m) this._tbl(m[1]);
      return;
    }
    if (up.startsWith('INSERT')) return this._insert(sql, params);
    if (up.startsWith('UPDATE')) return this._update(sql, params);
    if (up.startsWith('DELETE')) return this._delete(sql, params);
  }

  /** Substitute `?` placeholders with param values. */
  private _sub(sql: string, params: BindValue[]): string {
    let i = 0;
    return sql.replace(/\?/g, () => {
      const v = params[i++];
      if (v === null || v === undefined) return 'NULL';
      if (typeof v === 'string') return `'${v.replace(/'/g, "''")}'`;
      return String(v);
    });
  }

  private _insert(sql: string, params: BindValue[]): void {
    // INSERT [OR IGNORE] INTO table (cols) VALUES (vals)
    const colsMatch = sql.match(/INTO\s+(\w+)\s*\(([^)]+)\)/i);
    const valsMatch = sql.match(/VALUES\s*\(([^)]+)\)/i);
    if (!colsMatch || !valsMatch) return;

    const table = this._tbl(colsMatch[1]);
    const cols = colsMatch[2].split(',').map((c) => c.trim().toLowerCase());

    // Parse values — may be literals ('x', 1) or '?'
    const rawVals = this._splitValues(valsMatch[1]);
    let paramIdx = 0;
    const row: Row = {};
    cols.forEach((col, i) => {
      const raw = rawVals[i]?.trim() ?? 'NULL';
      if (raw === '?') {
        row[col] = params[paramIdx++] ?? null;
      } else {
        row[col] = this._parseLiteral(raw);
      }
    });

    // Skip if primary key already exists (first column = PK by convention).
    const pk = cols[0];
    if (table.some((r) => r[pk] === row[pk])) return;
    table.push(row);
  }

  /** Splits a VALUES list respecting nested parens/strings. */
  private _splitValues(raw: string): string[] {
    const parts: string[] = [];
    let depth = 0;
    let inStr = false;
    let cur = '';
    for (const ch of raw) {
      if (ch === "'" && !inStr) { inStr = true; cur += ch; continue; }
      if (ch === "'" && inStr) { inStr = false; cur += ch; continue; }
      if (inStr) { cur += ch; continue; }
      if (ch === '(') { depth++; cur += ch; continue; }
      if (ch === ')') { depth--; cur += ch; continue; }
      if (ch === ',' && depth === 0) { parts.push(cur); cur = ''; continue; }
      cur += ch;
    }
    if (cur.trim()) parts.push(cur);
    return parts;
  }

  private _parseLiteral(raw: string): BindValue {
    const t = raw.trim();
    if (t === 'NULL') return null;
    if (t.startsWith("'") && t.endsWith("'")) return t.slice(1, -1);
    const n = Number(t);
    return isNaN(n) ? t : n;
  }

  private _update(sql: string, params: BindValue[]): void {
    const filled = this._sub(sql, params);
    // UPDATE table SET col=val, ... WHERE col=val [AND ...]
    const m = filled.match(/UPDATE\s+(\w+)\s+SET\s+([\s\S]+?)\s+WHERE\s+([\s\S]+)$/i);
    if (!m) return;
    const table = this._tbl(m[1]);
    const setMap = this._parseAssignments(m[2]);
    const pred = this._makePred(m[3]);
    table.forEach((row) => {
      if (pred(row)) Object.assign(row, setMap);
    });
  }

  private _delete(sql: string, params: BindValue[]): void {
    const filled = this._sub(sql, params);
    const m = filled.match(/DELETE\s+FROM\s+(\w+)\s+WHERE\s+([\s\S]+)$/i);
    if (!m) return;
    const key = m[1].toLowerCase();
    const pred = this._makePred(m[2]);
    const remaining = (this.tables.get(key) ?? []).filter((r) => !pred(r));
    this.tables.set(key, remaining);
  }

  /** Parse "col=val, col2=val2" into an object. */
  private _parseAssignments(clause: string): Row {
    const result: Row = {};
    for (const part of clause.split(',')) {
      const idx = part.indexOf('=');
      if (idx < 0) continue;
      const col = part.slice(0, idx).trim().toLowerCase();
      const val = this._parseLiteral(part.slice(idx + 1).trim());
      result[col] = val;
    }
    return result;
  }

  /** Build a predicate function from a WHERE clause string (already param-substituted). */
  private _makePred(clause: string): (row: Row) => boolean {
    const conditions = clause.trim().split(/\s+AND\s+/i);
    return (row: Row) =>
      conditions.every((cond) => {
        const isNull = cond.match(/^(\w+(?:\.\w+)?)\s+IS\s+NULL$/i);
        if (isNull) {
          const col = isNull[1].split('.').pop()!.toLowerCase();
          return row[col] === null || row[col] === undefined;
        }
        const isNotNull = cond.match(/^(\w+(?:\.\w+)?)\s+IS\s+NOT\s+NULL$/i);
        if (isNotNull) {
          const col = isNotNull[1].split('.').pop()!.toLowerCase();
          return row[col] !== null && row[col] !== undefined;
        }
        const eq = cond.match(/^(\w+(?:\.\w+)?)\s*=\s*(.+)$/i);
        if (eq) {
          const col = eq[1].split('.').pop()!.toLowerCase();
          // eslint-disable-next-line eqeqeq
          return row[col] == this._parseLiteral(eq[2].trim());
        }
        return true;
      });
  }

  /**
   * _select handles the specific SELECT patterns in StorageService:
   *   1. Simple "SELECT * FROM table WHERE …"
   *   2. "SELECT … FROM folders f LEFT JOIN recordings r ON … GROUP BY f.id" (getFolders)
   */
  private _select(sql: string, params: BindValue[]): Row[] {
    const filled = this._sub(sql, params);

    // ── getFolders pattern: LEFT JOIN with COUNT ──────────────────────────
    if (/LEFT\s+JOIN/i.test(filled)) {
      return this._selectWithJoin(filled);
    }

    // ── Simple SELECT * FROM table [WHERE …] ─────────────────────────────
    // Match table name, stopping before SQL keywords (alias is optional single char).
    const tableMatch = filled.match(/FROM\s+(\w+)/i);
    if (!tableMatch) return [];
    const rows = [...this._tbl(tableMatch[1])];

    const whereMatch = filled.match(/WHERE\s+([\s\S]+?)(?:\s+ORDER\s|\s+GROUP\s|$)/i);
    if (!whereMatch) return rows;
    const pred = this._makePred(whereMatch[1].trim());
    return rows.filter(pred);
  }

  /** Handles: SELECT … FROM folders f LEFT JOIN recordings r ON … GROUP BY f.id */
  private _selectWithJoin(sql: string): Row[] {
    // Extract folder rows.
    const folders = [...this._tbl('folders')];
    const recordings = [...this._tbl('recordings')];

    // Compute recording_count for each folder (active recordings only).
    return folders.map((folder) => {
      const count = recordings.filter(
        (r) => r['folder_id'] === folder['id'] && (r['deleted_at'] === null || r['deleted_at'] === undefined),
      ).length;
      return { ...folder, recording_count: count };
    });
  }
}

// ── Jest mock setup ───────────────────────────────────────────────────────────

// Variable MUST be prefixed `mock` so jest.mock factory can reference it.
let mockFakeDb: FakeDatabase;

jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: jest.fn(async () => mockFakeDb),
}));

// ── Test suite ────────────────────────────────────────────────────────────────

import * as StorageService from '@/db/StorageService';
import { INBOX_FOLDER_ID } from '@/constants';
import type { Recording } from '@/types';

const makeRecording = (overrides: Partial<Recording> = {}): Recording => ({
  id: 'rec-1',
  folder_id: INBOX_FOLDER_ID,
  title: 'Test Recording',
  audio_uri: 'file:///audio/rec-1.m4a',
  duration_ms: 5000,
  transcript_text: null,
  transcription_status: 'pending',
  error_code: null,
  error_message: null,
  deleted_at: null,
  created_at: 1000,
  updated_at: 1000,
  ...overrides,
});

beforeEach(async () => {
  mockFakeDb = new FakeDatabase();
  await StorageService._reset();
  await StorageService.init();
});

// ── Migration & seeding ───────────────────────────────────────────────────────

describe('init / migrations', () => {
  it('seeds the Inbox folder', async () => {
    const folders = await StorageService.getFolders();
    expect(folders.some((f) => f.id === INBOX_FOLDER_ID)).toBe(true);
  });

  it('Inbox is a system folder (is_system = 1)', async () => {
    const folders = await StorageService.getFolders();
    const inbox = folders.find((f) => f.id === INBOX_FOLDER_ID)!;
    expect(inbox.is_system).toBe(1);
  });

  it('is idempotent — second init() does not re-seed Inbox', async () => {
    await StorageService.init(); // second call — should be no-op
    const folders = await StorageService.getFolders();
    expect(folders.filter((f) => f.id === INBOX_FOLDER_ID)).toHaveLength(1);
  });
});

// ── Folder CRUD ───────────────────────────────────────────────────────────────

describe('folder CRUD', () => {
  it('insertFolder + getFolders round-trip', async () => {
    await StorageService.insertFolder({
      id: 'folder-1',
      name: 'Ideas',
      is_system: 0,
      created_at: 2000,
      updated_at: 2000,
    });
    const folders = await StorageService.getFolders();
    expect(folders.some((f) => f.id === 'folder-1' && f.name === 'Ideas')).toBe(true);
  });

  it('updateFolder patches the name', async () => {
    await StorageService.insertFolder({
      id: 'folder-2',
      name: 'OldName',
      is_system: 0,
      created_at: 3000,
      updated_at: 3000,
    });
    await StorageService.updateFolder('folder-2', { name: 'NewName', updated_at: 4000 });
    const folders = await StorageService.getFolders();
    const f = folders.find((x) => x.id === 'folder-2')!;
    expect(f.name).toBe('NewName');
  });

  it('deleteFolder moves recordings to Inbox', async () => {
    await StorageService.insertFolder({
      id: 'folder-3',
      name: 'ToDelete',
      is_system: 0,
      created_at: 5000,
      updated_at: 5000,
    });
    await StorageService.insertRecording(makeRecording({ id: 'rec-x', folder_id: 'folder-3' }));
    await StorageService.deleteFolder('folder-3');

    const moved = await StorageService.getRecording('rec-x');
    expect(moved?.folder_id).toBe(INBOX_FOLDER_ID);

    const folders = await StorageService.getFolders();
    expect(folders.some((f) => f.id === 'folder-3')).toBe(false);
  });
});

// ── Recording CRUD ────────────────────────────────────────────────────────────

describe('recording CRUD', () => {
  it('insertRecording + getRecording round-trip', async () => {
    await StorageService.insertRecording(makeRecording());
    const r = await StorageService.getRecording('rec-1');
    expect(r).not.toBeNull();
    expect(r!.title).toBe('Test Recording');
  });

  it('getRecordingsForFolder returns active recordings', async () => {
    await StorageService.insertRecording(makeRecording());
    const list = await StorageService.getRecordingsForFolder(INBOX_FOLDER_ID);
    expect(list).toHaveLength(1);
  });

  it('updateRecording patches transcription_status and transcript_text', async () => {
    await StorageService.insertRecording(makeRecording());
    await StorageService.updateRecording('rec-1', {
      transcription_status: 'done',
      transcript_text: 'Hello world',
      updated_at: 9999,
    });
    const r = await StorageService.getRecording('rec-1');
    expect(r!.transcription_status).toBe('done');
    expect(r!.transcript_text).toBe('Hello world');
  });
});

// ── Soft delete ───────────────────────────────────────────────────────────────

describe('soft delete', () => {
  it('softDeleteRecording hides row from getRecordingsForFolder', async () => {
    await StorageService.insertRecording(makeRecording());
    await StorageService.softDeleteRecording('rec-1');
    const list = await StorageService.getRecordingsForFolder(INBOX_FOLDER_ID);
    expect(list).toHaveLength(0);
  });

  it('getRecording still returns the soft-deleted row', async () => {
    await StorageService.insertRecording(makeRecording());
    await StorageService.softDeleteRecording('rec-1');
    const r = await StorageService.getRecording('rec-1');
    expect(r).not.toBeNull();
    expect(r!.deleted_at).not.toBeNull();
  });
});

// ── recoverStuckRecordings ────────────────────────────────────────────────────

describe('recoverStuckRecordings', () => {
  it('resets processing rows to pending', async () => {
    await StorageService.insertRecording(
      makeRecording({ id: 'stuck', transcription_status: 'processing' }),
    );
    await StorageService.recoverStuckRecordings();
    const r = await StorageService.getRecording('stuck');
    expect(r!.transcription_status).toBe('pending');
  });

  it('does not touch done rows', async () => {
    await StorageService.insertRecording(
      makeRecording({ id: 'done-rec', transcription_status: 'done' }),
    );
    await StorageService.recoverStuckRecordings();
    const r = await StorageService.getRecording('done-rec');
    expect(r!.transcription_status).toBe('done');
  });
});

// ── recording_count aggregate ─────────────────────────────────────────────────

describe('recording_count', () => {
  it('getFolders returns correct recording_count for active recordings', async () => {
    await StorageService.insertRecording(makeRecording({ id: 'c1' }));
    await StorageService.insertRecording(makeRecording({ id: 'c2' }));
    const folders = await StorageService.getFolders();
    const inbox = folders.find((f) => f.id === INBOX_FOLDER_ID)!;
    expect(inbox.recording_count).toBe(2);
  });

  it('soft-deleted recordings are excluded from recording_count', async () => {
    await StorageService.insertRecording(makeRecording({ id: 'd1' }));
    await StorageService.softDeleteRecording('d1');
    const folders = await StorageService.getFolders();
    const inbox = folders.find((f) => f.id === INBOX_FOLDER_ID)!;
    expect(inbox.recording_count).toBe(0);
  });
});
