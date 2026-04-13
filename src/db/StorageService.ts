/**
 * StorageService — SQLite persistence layer.
 *
 * Uses expo-sqlite v2 async API. Call `init()` once at app launch before any
 * other method. All mutations run inside explicit transactions.
 */

import * as SQLite from 'expo-sqlite';
import { INBOX_FOLDER_ID } from '@/constants';
import type { Folder, Recording, TranscriptionStatus } from '@/types';

let db: SQLite.SQLiteDatabase | null = null;

// ---------------------------------------------------------------------------
// Init & migrations
// ---------------------------------------------------------------------------

/** Open the database and run all schema migrations. Idempotent. */
export async function init(): Promise<void> {
  if (db) return;
  db = await SQLite.openDatabaseAsync('pitchit.db');
  await _runMigrations(db);
}

/** Exposed for testing — returns the active DB instance (throws if not init'd). */
export function _getDb(): SQLite.SQLiteDatabase {
  if (!db) throw new Error('StorageService not initialised — call init() first');
  return db;
}

/** For tests: close and reset the singleton so init() can be called again. */
export async function _reset(): Promise<void> {
  if (db) {
    await db.closeAsync();
    db = null;
  }
}

async function _runMigrations(database: SQLite.SQLiteDatabase): Promise<void> {
  await database.withTransactionAsync(async () => {
    await database.execAsync(`
      CREATE TABLE IF NOT EXISTS folders (
        id         TEXT PRIMARY KEY,
        name       TEXT NOT NULL,
        is_system  INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS recordings (
        id                   TEXT PRIMARY KEY,
        folder_id            TEXT NOT NULL REFERENCES folders(id),
        title                TEXT NOT NULL,
        audio_uri            TEXT NOT NULL,
        duration_ms          INTEGER NOT NULL,
        transcript_text      TEXT,
        transcription_status TEXT NOT NULL
          CHECK (transcription_status IN
                 ('pending','queued','processing','done','failed')),
        error_code           TEXT,
        error_message        TEXT,
        deleted_at           INTEGER,
        created_at           INTEGER NOT NULL,
        updated_at           INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_recordings_folder
        ON recordings(folder_id);
      CREATE INDEX IF NOT EXISTS idx_recordings_created
        ON recordings(created_at);
      CREATE INDEX IF NOT EXISTS idx_recordings_active
        ON recordings(deleted_at);
    `);

    // Seed the system Inbox folder if it doesn't exist yet.
    const existing = await database.getFirstAsync<{ id: string }>(
      'SELECT id FROM folders WHERE id = ?',
      [INBOX_FOLDER_ID],
    );
    if (!existing) {
      const now = Date.now();
      await database.runAsync(
        'INSERT INTO folders (id, name, is_system, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
        [INBOX_FOLDER_ID, 'Inbox', 1, now, now],
      );
    }
  });
}

// ---------------------------------------------------------------------------
// Folder queries
// ---------------------------------------------------------------------------

/** Return all non-deleted folders with a recording_count aggregate. */
export async function getFolders(): Promise<Folder[]> {
  const database = _getDb();
  const rows = await database.getAllAsync<{
    id: string;
    name: string;
    is_system: number;
    recording_count: number;
    created_at: number;
    updated_at: number;
  }>(
    `SELECT f.id, f.name, f.is_system, f.created_at, f.updated_at,
            COUNT(r.id) AS recording_count
     FROM folders f
     LEFT JOIN recordings r
       ON r.folder_id = f.id AND r.deleted_at IS NULL
     GROUP BY f.id
     ORDER BY f.is_system DESC, f.created_at ASC`,
  );
  return rows.map(_rowToFolder);
}

/** Insert a new folder row. */
export async function insertFolder(folder: Omit<Folder, 'recording_count'>): Promise<void> {
  const database = _getDb();
  await database.runAsync(
    'INSERT INTO folders (id, name, is_system, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    [folder.id, folder.name, folder.is_system, folder.created_at, folder.updated_at],
  );
}

/** Patch mutable fields on a folder row. */
export async function updateFolder(
  id: string,
  patch: Partial<Pick<Folder, 'name' | 'updated_at'>>,
): Promise<void> {
  const database = _getDb();
  const fields = Object.keys(patch) as Array<keyof typeof patch>;
  const setClauses = fields.map((f) => `${f} = ?`).join(', ');
  const values = [...fields.map((f) => patch[f]), id];
  await database.runAsync(`UPDATE folders SET ${setClauses} WHERE id = ?`, values as SQLite.SQLiteBindValue[]);
}

/**
 * Delete a folder: move all its recordings to Inbox first, then delete the row.
 * Runs in a single transaction.
 */
export async function deleteFolder(id: string): Promise<void> {
  const database = _getDb();
  const now = Date.now();
  await database.withTransactionAsync(async () => {
    await database.runAsync(
      'UPDATE recordings SET folder_id = ?, updated_at = ? WHERE folder_id = ?',
      [INBOX_FOLDER_ID, now, id],
    );
    await database.runAsync('DELETE FROM folders WHERE id = ?', [id]);
  });
}

// ---------------------------------------------------------------------------
// Recording queries
// ---------------------------------------------------------------------------

/** Return active (non-deleted) recordings for a folder, newest first. */
export async function getRecordingsForFolder(folderId: string): Promise<Recording[]> {
  const database = _getDb();
  const rows = await database.getAllAsync<RecordingRow>(
    `SELECT * FROM recordings
     WHERE folder_id = ? AND deleted_at IS NULL
     ORDER BY created_at DESC`,
    [folderId],
  );
  return rows.map(_rowToRecording);
}

/** Return a single recording by id (includes soft-deleted). */
export async function getRecording(id: string): Promise<Recording | null> {
  const database = _getDb();
  const row = await database.getFirstAsync<RecordingRow>(
    'SELECT * FROM recordings WHERE id = ?',
    [id],
  );
  return row ? _rowToRecording(row) : null;
}

/** Insert a new recording row. */
export async function insertRecording(recording: Recording): Promise<void> {
  const database = _getDb();
  await database.runAsync(
    `INSERT INTO recordings
     (id, folder_id, title, audio_uri, duration_ms, transcript_text,
      transcription_status, error_code, error_message, deleted_at,
      created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      recording.id,
      recording.folder_id,
      recording.title,
      recording.audio_uri,
      recording.duration_ms,
      recording.transcript_text,
      recording.transcription_status,
      recording.error_code,
      recording.error_message,
      recording.deleted_at,
      recording.created_at,
      recording.updated_at,
    ],
  );
}

/** Patch mutable fields on a recording row. */
export async function updateRecording(
  id: string,
  patch: Partial<
    Pick<
      Recording,
      | 'title'
      | 'transcript_text'
      | 'transcription_status'
      | 'error_code'
      | 'error_message'
      | 'updated_at'
    >
  >,
): Promise<void> {
  const database = _getDb();
  const fields = Object.keys(patch) as Array<keyof typeof patch>;
  const setClauses = fields.map((f) => `${f} = ?`).join(', ');
  const values = [...fields.map((f) => patch[f]), id];
  await database.runAsync(`UPDATE recordings SET ${setClauses} WHERE id = ?`, values as SQLite.SQLiteBindValue[]);
}

/** Soft-delete a recording by setting deleted_at. */
export async function softDeleteRecording(id: string): Promise<void> {
  const database = _getDb();
  await database.runAsync(
    'UPDATE recordings SET deleted_at = ?, updated_at = ? WHERE id = ?',
    [Date.now(), Date.now(), id],
  );
}

/**
 * Reset any recordings stuck in `processing` status back to `pending` so they
 * will be retried on the next pipeline run (called at app launch).
 */
export async function recoverStuckRecordings(): Promise<void> {
  const database = _getDb();
  const now = Date.now();
  await database.runAsync(
    `UPDATE recordings
     SET transcription_status = 'pending', updated_at = ?
     WHERE transcription_status = 'processing' AND deleted_at IS NULL`,
    [now],
  );
}

// ---------------------------------------------------------------------------
// Row ↔ type mapping helpers
// ---------------------------------------------------------------------------

interface RecordingRow {
  id: string;
  folder_id: string;
  title: string;
  audio_uri: string;
  duration_ms: number;
  transcript_text: string | null;
  transcription_status: TranscriptionStatus;
  error_code: string | null;
  error_message: string | null;
  deleted_at: number | null;
  created_at: number;
  updated_at: number;
}

function _rowToRecording(row: RecordingRow): Recording {
  return {
    id: row.id,
    folder_id: row.folder_id,
    title: row.title,
    audio_uri: row.audio_uri,
    duration_ms: row.duration_ms,
    transcript_text: row.transcript_text,
    transcription_status: row.transcription_status,
    error_code: row.error_code as Recording['error_code'],
    error_message: row.error_message,
    deleted_at: row.deleted_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function _rowToFolder(row: {
  id: string;
  name: string;
  is_system: number;
  recording_count: number;
  created_at: number;
  updated_at: number;
}): Folder {
  return {
    id: row.id,
    name: row.name,
    is_system: row.is_system as 0 | 1,
    recording_count: row.recording_count,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
