/**
 * End-to-end integration smoke test (TASK-016).
 *
 * Wires real StorageService (in-memory SQLite fake) with mocked
 * RecorderService, TranscriptionService, and TitleService to verify:
 *   record → insert pending → transcribe → update to done with transcript
 *   and title → soft delete removes row from active list.
 */

// ── In-memory SQLite fake (same as StorageService.test.ts) ───────────────────

type BindValue = string | number | boolean | null | undefined;
type Row = Record<string, BindValue>;

class FakeDatabase {
  readonly tables: Map<string, Row[]> = new Map();

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
  async withTransactionAsync(cb: () => Promise<void>): Promise<void> { await cb(); }
  async closeAsync(): Promise<void> { this.tables.clear(); }

  private _split(sql: string): string[] {
    return sql.split(';').map((s) => s.trim()).filter(Boolean);
  }

  private _tableName(sql: string): string {
    const m = sql.match(/(?:INTO|FROM|UPDATE|TABLE(?:\s+IF\s+NOT\s+EXISTS)?)\s+(\w+)/i);
    return m ? m[1].toLowerCase() : '';
  }

  private _exec(sql: string, params: BindValue[]): void {
    const s = sql.trim();
    if (/^CREATE TABLE/i.test(s)) {
      const name = this._tableName(s);
      if (!this.tables.has(name)) this.tables.set(name, []);
    } else if (/^CREATE INDEX/i.test(s)) {
      // ignore
    } else if (/^INSERT/i.test(s)) {
      const name = this._tableName(s);
      const cols = s.match(/\(([^)]+)\)\s+VALUES/i)?.[1].split(',').map((c) => c.trim()) ?? [];
      const row: Row = {};
      cols.forEach((c, i) => { row[c] = params[i] as BindValue ?? null; });
      this.tables.get(name)?.push(row);
    } else if (/^UPDATE/i.test(s)) {
      const name = this._tableName(s);
      const setMatch = s.match(/SET\s+(.+?)\s+WHERE/i)?.[1] ?? '';
      const whereMatch = s.match(/WHERE\s+(.+)/i)?.[1] ?? '';
      const setPairs = setMatch.split(',').map((p) => p.trim());
      const rows = this.tables.get(name) ?? [];
      let pi = 0;
      const updates: Record<string, BindValue> = {};
      setPairs.forEach((p) => {
        const col = p.split('=')[0].trim();
        updates[col] = params[pi++] as BindValue;
      });
      const whereCol = whereMatch.split('=')[0].trim();
      const whereVal = params[pi] as BindValue;
      rows.forEach((r) => { if (r[whereCol] === whereVal) Object.assign(r, updates); });
    }
  }

  private _select(sql: string, params: BindValue[]): Row[] {
    const name = this._tableName(sql);
    let rows = [...(this.tables.get(name) ?? [])];
    const whereMatch = sql.match(/WHERE\s+(.+?)(?:\s+ORDER|\s+LIMIT|$)/i)?.[1];
    if (whereMatch) {
      const conditions = whereMatch.split(/\s+AND\s+/i);
      let pi = 0;
      conditions.forEach((cond) => {
        if (/IS NULL/i.test(cond)) {
          const col = cond.split(/\s+/)[0].trim();
          rows = rows.filter((r) => r[col] == null);
        } else if (/=/.test(cond)) {
          const col = cond.split('=')[0].trim();
          const val = params[pi++] as BindValue;
          rows = rows.filter((r) => r[col] === val);
        }
      });
    }
    return rows;
  }
}

// Jest hoists jest.mock() calls, so the factory cannot reference FakeDatabase directly.
// We use a lazy getter: mockFakeDb starts as null and is assigned before any test runs.
let mockFakeDb: FakeDatabase;

jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: jest.fn().mockImplementation(() => Promise.resolve(mockFakeDb)),
}));

// ── Service mocks ─────────────────────────────────────────────────────────────

jest.mock('@/services/RecorderService', () => ({
  start: jest.fn().mockResolvedValue(undefined),
  stop: jest.fn().mockResolvedValue({ uri: 'file://audio/test.m4a', durationMs: 5000 }),
  onDurationTick: jest.fn(),
  onWarning: jest.fn(),
  requestPermission: jest.fn().mockResolvedValue(true),
}));

jest.mock('@/services/TranscriptionService', () => ({
  isOnline: jest.fn().mockResolvedValue(true),
  transcribe: jest.fn().mockResolvedValue({ text: 'Hello world transcript' }),
}));

jest.mock('@/services/TitleService', () => ({
  generate: jest.fn().mockResolvedValue('Hello World'),
}));

// ── Test ──────────────────────────────────────────────────────────────────────

import * as StorageService from '@/db/StorageService';
import * as RecordingPipeline from '@/services/RecordingPipeline';
import { INBOX_FOLDER_ID } from '@/constants';

beforeEach(async () => {
  mockFakeDb = new FakeDatabase();
  await StorageService._reset();
  await StorageService.init();
});

it('full pipeline: record → pending → done with transcript and title → soft delete', async () => {
  // 1. Start and stop recording — inserts row with status pending.
  await RecordingPipeline.start();
  const recording = await RecordingPipeline.stop(INBOX_FOLDER_ID);

  expect(recording.transcription_status).toBe('pending');

  // 2. Wait for async _process to complete.
  await new Promise((r) => setTimeout(r, 50));

  // 3. Verify row is now done with transcript and title.
  const done = await StorageService.getRecording(recording.id);
  expect(done?.transcription_status).toBe('done');
  expect(done?.transcript_text).toBe('Hello world transcript');
  expect(done?.title).toBe('Hello World');

  // 4. Soft delete removes row from active list.
  await StorageService.softDeleteRecording(recording.id);
  const active = await StorageService.getRecordingsForFolder(INBOX_FOLDER_ID);
  expect(active.find((r) => r.id === recording.id)).toBeUndefined();
});
