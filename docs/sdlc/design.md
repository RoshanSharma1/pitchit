# PitchIt — System Design (v2, post-review)

> Architecture for v1: local-first, iOS-only, React Native / Expo.
> Updated after design review — offline transcription deferred, transcript stored
> in SQLite, RecordingPipeline orchestrator added, error handling expanded.

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                      iOS Device                          │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │               Expo Router (UI Layer)               │  │
│  │                                                    │  │
│  │  HomeScreen    FolderScreen   RecordScreen         │  │
│  │  (FolderList)  (RecList)      (LockedRec)          │  │
│  │                               DetailScreen         │  │
│  │                               (Playback + MD)      │  │
│  └──────────────────────┬─────────────────────────────┘  │
│                         │ hooks / context                 │
│  ┌──────────────────────▼─────────────────────────────┐  │
│  │              RecordingPipeline (orchestrator)       │  │
│  │  Owns: record → save → queue → transcribe → title  │  │
│  │  Handles: retries, partial failures, recovery      │  │
│  └──────┬────────────┬───────────────┬────────────────┘  │
│         │            │               │                    │
│  ┌──────▼──┐  ┌──────▼──────┐  ┌────▼────────────────┐  │
│  │Recorder │  │Transcription│  │   TitleService       │  │
│  │Service  │  │Service      │  │   FolderService      │  │
│  │         │  │(online only)│  │   ExportService      │  │
│  └──────┬──┘  └──────┬──────┘  └────┬────────────────┘  │
│         │            │               │                    │
│  ┌──────▼────────────▼───────────────▼────────────────┐  │
│  │          StorageService  (SQLite + FileSystem)      │  │
│  │   expo-sqlite v2 (async)   expo-file-system        │  │
│  └─────────────────────────────────────────────────────┘  │
│                                                           │
│  ┌─────────────────────────────────────────────────────┐  │
│  │         External APIs (online-only, optional)       │  │
│  │   Gemini 1.5 Flash — transcription + title gen     │  │
│  └─────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

> **Note on API key security:** In v1 the Gemini API key is bundled via
> `app.config.js`. This is acceptable for personal/prototype use only.
> A backend proxy must be introduced before any public distribution.

---

## 2. Component Responsibilities

### 2.1 UI Layer (Expo Router screens)

| Screen | Route | Responsibility |
|--------|-------|---------------|
| `HomeScreen` | `/` | List folders with recording counts; FAB to start recording |
| `FolderScreen` | `/folder/[id]` | List recordings in a folder; swipe-to-delete |
| `RecordScreen` | `/record` | Full-screen locked recording; waveform + timer; tap Stop to finish |
| `DetailScreen` | `/recording/[id]` | Playback controls, transcript view, export, rename, delete |

Navigation: Expo Router file-based routing. RecordScreen opens as a modal.

### 2.2 RecordingPipeline (Orchestrator)

Single entry point for the record → transcribe → title lifecycle. No UI code
calls services directly; all calls go through the pipeline.

Responsibilities:
- Kick off recording via `RecorderService`
- Persist recording row immediately on stop (status: `pending`)
- Check network reachability; if online, start `TranscriptionService`
- On transcription success, call `TitleService`
- Update recording row with results or error details
- On app launch: reset any `processing` rows to `pending` and retry if online
- Enforce max recording duration (10 minutes); warn user at 9 minutes

### 2.3 Services

#### `RecorderService`
- Wraps `expo-av` Audio recording API
- Configures: AAC, 128 kbps, mono, `.m4a`
- Enforces 10-minute hard cap: stops recording and notifies pipeline
- Returns `{ uri, durationMs }` on stop
- **Silence trimming removed from v1**

#### `TranscriptionService`
- **Online only** — checks `NetInfo.isConnected` before proceeding
- If offline: returns `{ status: 'queued' }` — pipeline retries when connected
- Sends audio to Gemini API (base64 inline for recordings ≤ 10 min / ~15 MB)
- Returns transcript text string

#### `TitleService`
- **Online only** — calls Gemini with transcript text
- If offline or if transcription is still pending: returns timestamp fallback
- Returns title string (≤ 60 chars)

#### `FolderService`
- CRUD on `folders` table
- `Inbox` folder seeded at first launch; protected by `is_system = 1` flag
- Delete folder: moves recordings to Inbox before deleting
- Cannot delete a folder where `is_system = 1`

#### `StorageService`
- Thin typed wrapper over `expo-sqlite` v2 async API
- Runs schema migrations on app start (inside a transaction; rolls back on error)
- No raw SQL outside this module

#### `ExportService`
- Reads `transcript_text` from the recording row (no file read required)
- Assembles Markdown with YAML front-matter
- Writes temp `.md` to cache dir → opens iOS share sheet via `expo-sharing`

---

## 3. Data Model

### SQLite Schema

```sql
-- Folders
CREATE TABLE folders (
  id          TEXT PRIMARY KEY,          -- UUID v4
  name        TEXT NOT NULL,
  is_system   INTEGER NOT NULL DEFAULT 0, -- 1 = cannot be deleted
  created_at  INTEGER NOT NULL,           -- Unix ms
  updated_at  INTEGER NOT NULL
);

INSERT INTO folders VALUES ('inbox', 'Inbox', 1, <ts>, <ts>);

-- Recordings
CREATE TABLE recordings (
  id                   TEXT PRIMARY KEY,   -- UUID v4
  folder_id            TEXT NOT NULL REFERENCES folders(id),
  title                TEXT NOT NULL,
  audio_uri            TEXT NOT NULL,      -- file:// in app documents dir
  duration_ms          INTEGER NOT NULL,
  transcript_text      TEXT,               -- stored in DB, not as file
  transcription_status TEXT NOT NULL
      CHECK (transcription_status IN
             ('pending','queued','processing','done','failed')),
  error_code           TEXT,               -- e.g. 'NETWORK_ERROR', 'API_LIMIT'
  error_message        TEXT,
  deleted_at           INTEGER,            -- soft delete; NULL = active
  created_at           INTEGER NOT NULL,
  updated_at           INTEGER NOT NULL
);

CREATE INDEX idx_recordings_folder   ON recordings(folder_id);
CREATE INDEX idx_recordings_created  ON recordings(created_at DESC);
CREATE INDEX idx_recordings_active   ON recordings(deleted_at)
  WHERE deleted_at IS NULL;
```

**Key changes from original design:**
- `transcript_text` in DB (not a separate file) — eliminates file/DB inconsistency
- `error_code` + `error_message` — granular failure tracking
- `deleted_at` soft delete — safe deletion with recovery path
- `is_system` on folders — Inbox protected at data layer
- `queued` status — offline-aware transcription state

### TypeScript Types

```typescript
export type TranscriptionStatus =
  | 'pending'
  | 'queued'
  | 'processing'
  | 'done'
  | 'failed';

export interface Folder {
  id: string;
  name: string;
  isSystem: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface Recording {
  id: string;
  folderId: string;
  title: string;
  audioUri: string;
  durationMs: number;
  transcriptText: string | null;
  transcriptionStatus: TranscriptionStatus;
  errorCode: string | null;
  errorMessage: string | null;
  deletedAt: number | null;
  createdAt: number;
  updatedAt: number;
}
```

### File Layout (device)

```
<DocumentDirectory>/
  audio/
    <recording-id>.m4a      ← only audio stored as file
```

Transcripts live in SQLite only. No separate transcript files in v1.

---

## 4. Key Flows

### 4.1 Record → Persist → Transcribe → Title

```
User taps Record
  └─► RecordScreen mounts; mic permission requested if needed
        └─► RecordingPipeline.start()
              └─► RecorderService.start() — Expo AV begins (AAC 128kbps)
                    └─► Timer shown; at 9 min: warn user
                          └─► At 10 min: RecorderService auto-stops

User taps Stop (or 10-min cap reached)
  └─► RecorderService.stop() → { uri, durationMs }
        └─► Insert recording row (title=timestamp, status='pending')
              └─► RecordingPipeline checks NetInfo
                    │
                    ├─ [offline] → update status='queued'
                    │              retry when NetInfo fires 'connected'
                    │
                    └─ [online]  → update status='processing'
                                    └─► TranscriptionService.transcribe(uri)
                                          ├─ success → transcript_text saved
                                          │            status='done' (temp)
                                          │   └─► TitleService.generate(text)
                                          │         ├─ success → title saved
                                          │         └─ fail    → timestamp title
                                          │                      error_code set
                                          └─ fail   → status='failed'
                                                       error_code/message set
```

### 4.2 App Launch Recovery

```
App launches
  └─► StorageService.recoverStuckRecordings()
        └─► UPDATE recordings SET status='pending'
            WHERE status='processing' AND deleted_at IS NULL
              └─► RecordingPipeline.retryPending()
                    └─► [if online] transcribe each pending recording
```

### 4.3 Export

```
User taps Export on DetailScreen
  └─► ExportService.export(recording)
        └─► Build Markdown string from recording.transcriptText + metadata
              └─► Write temp .md to CacheDirectory
                    └─► expo-sharing.shareAsync(tempPath)
                          └─► iOS share sheet opens
```

### 4.4 Delete Recording

```
User confirms delete
  └─► StorageService.softDelete(id)  — sets deleted_at = now()
        └─► expo-file-system.deleteAsync(audioUri)  — audio file removed
              └─► transcript_text already in DB; removed with row on hard purge
```

---

## 5. Technology Choices with Rationale

| Technology | Choice | Rationale |
|-----------|--------|-----------|
| Framework | React Native + Expo SDK 51 | First-party Expo; all native APIs available |
| Routing | Expo Router v3 | File-based; typed routes; modal support |
| Audio | `expo-av` | Stable AAC recording and playback |
| Database | `expo-sqlite` v2 | Persistent local storage; async API |
| File system | `expo-file-system` | Audio file management |
| Transcription | Gemini 1.5 Flash (free tier) | Free; supports audio input |
| Offline handling | `@react-native-community/netinfo` | Detect connectivity for queue/retry |
| Sharing | `expo-sharing` | Native share sheet; no OAuth |
| Haptics | `expo-haptics` | Feedback on record start/stop |
| Testing | Jest + RNTL | Standard RN test stack |
| Linting | ESLint + `@typescript-eslint` | Code quality |
| Type checking | TypeScript strict mode | Safety |

**Removed from v1:** Apple Speech Recognition (offline transcription deferred),
silence trimming DSP.

---

## 6. API Contracts

### Gemini Transcription

```
POST https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent
Authorization: Bearer $GEMINI_API_KEY

{
  "contents": [{
    "parts": [
      { "inline_data": { "mime_type": "audio/mp4", "data": "<base64>" } },
      { "text": "Transcribe this audio accurately. Return only the transcript text." }
    ]
  }]
}
```

Response path: `candidates[0].content.parts[0].text`

Max audio size inline: ~15 MB (≈ 10 min at 128 kbps AAC). Hard cap in
`RecorderService` ensures this is never exceeded.

### Gemini Title

```json
{
  "contents": [{
    "parts": [{
      "text": "Generate a concise title (max 60 chars) for this transcript:\n\n{transcript}\n\nReturn only the title."
    }]
  }]
}
```

### Environment Variables

```
GEMINI_API_KEY=<your-key>   # .env, gitignored
```

Accessed via `app.config.js` `extra.geminiApiKey` → `Constants.expoConfig.extra.geminiApiKey`.

**Security note:** This exposes the key in the app bundle. Acceptable for
personal/prototype use. A backend proxy is required before public release.

---

## 7. Security

- `GEMINI_API_KEY` in `.env` (gitignored); never committed
- All data stored in iOS app sandbox (not accessible to other apps)
- Soft delete retains data until explicitly purged — no accidental permanent loss
- Errors shown to user as friendly messages; raw API errors logged to console only
- **Known limitation:** API key is in client bundle (prototype-safe, not production-safe)

---

## 8. v1 Scope Boundary (What's In / Out)

| Feature | v1 | v2+ |
|---------|----|----|
| Recording (offline) | ✅ | |
| Local storage | ✅ | |
| Folder organisation | ✅ | |
| Online transcription (Gemini) | ✅ | |
| LLM title generation | ✅ | |
| Markdown export | ✅ | |
| Offline transcription | ❌ | ✅ |
| Silence trimming | ❌ | ✅ |
| Cloud sync | ❌ | ✅ |
| Auth / accounts | ❌ | ✅ |
| Backend API proxy | ❌ (prototype) | ✅ (production) |
| Android | ❌ | ✅ |

---

## 9. v2 Readiness

- UUID PKs and `created_at`/`updated_at` timestamps support conflict-free sync
- `deleted_at` soft delete enables sync tombstones
- `transcription_status` state machine extends naturally with `synced` state
- Adding `synced_at` column + backend auth is the only schema migration needed
- `is_system` folder flag already prevents data integrity issues at scale
