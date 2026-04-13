# PitchIt — System Design

> Architecture for v1: local-first, iOS-only, React Native / Expo.
> Cloud sync is out of scope but the data model is designed to accommodate it.

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                   iOS Device                         │
│                                                      │
│  ┌──────────────────────────────────────────────┐   │
│  │              Expo Router (UI Layer)           │   │
│  │                                               │   │
│  │  HomeScreen     RecordScreen   DetailScreen   │   │
│  │  (FolderList)   (LockedRec)    (Playback+MD)  │   │
│  └────────────────────┬─────────────────────────┘   │
│                       │ hooks / context               │
│  ┌────────────────────▼─────────────────────────┐   │
│  │             Services Layer                    │   │
│  │                                               │   │
│  │  RecorderService  TranscriptionService        │   │
│  │  TitleService     FolderService               │   │
│  │  ExportService    StorageService              │   │
│  └──────┬───────────────────────┬───────────────┘   │
│         │                       │                    │
│  ┌──────▼──────┐       ┌────────▼────────────────┐  │
│  │  Expo AV    │       │   SQLite (expo-sqlite)   │  │
│  │  (audio     │       │   + FileSystem           │  │
│  │   record /  │       │   (expo-file-system)     │  │
│  │   playback) │       └────────────────────────  ┘  │
│  └─────────────┘                                     │
│                                                      │
│  ┌────────────────────────────────────────────────┐  │
│  │           External APIs (online only)          │  │
│  │                                                │  │
│  │   Gemini API (transcription + title gen)       │  │
│  │   Apple Speech (on-device fallback)            │  │
│  └────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

---

## 2. Component Responsibilities

### 2.1 UI Layer (Expo Router screens)

| Screen | Route | Responsibility |
|--------|-------|---------------|
| `HomeScreen` | `/` | List folders with recording counts; navigate to folder or start recording |
| `FolderScreen` | `/folder/[id]` | List recordings in a folder; swipe-to-delete |
| `RecordScreen` | `/record` | Full-screen locked recording UI; waveform + timer; start/stop |
| `DetailScreen` | `/recording/[id]` | Playback controls, transcript view, export, rename, delete |

Navigation: Expo Router file-based routing. Modal stack for RecordScreen.

### 2.2 Services Layer

All services are plain TypeScript modules (no class instances). Each has a single responsibility and is unit-testable in isolation.

#### `RecorderService`
- Wraps `expo-av` Audio recording API
- Configures recording mode (AAC, 128 kbps, mono)
- Returns `{ uri, duration }` on stop
- Applies silence trimming via amplitude threshold check post-recording

#### `TranscriptionService`
- Checks network reachability (`@react-native-community/netinfo`)
- **Online:** sends audio file to Gemini API (`/v1beta/models/gemini-1.5-flash:generateContent` with inline audio)
- **Offline:** calls Apple Speech Recognition via `expo-speech` or native module
- Returns plain text transcript string

#### `TitleService`
- **Online:** calls Gemini API with transcript to generate a ≤ 60-char title
- **Offline:** returns `"Recording – {date}"` timestamp string

#### `FolderService`
- CRUD operations on `folders` table
- Ensures "Inbox" folder always exists (seeded on first launch)
- Moving recordings between folders

#### `StorageService`
- Thin wrapper over `expo-sqlite` (v2 async API)
- Runs migrations on app start
- Exposes typed query functions; no raw SQL in UI code

#### `ExportService`
- Assembles Markdown string from recording metadata + transcript
- Calls `expo-sharing` to open the iOS share sheet with the `.md` file

---

## 3. Data Model

### SQLite Schema

```sql
-- Folders
CREATE TABLE folders (
  id        TEXT PRIMARY KEY,   -- UUID v4
  name      TEXT NOT NULL,
  created_at INTEGER NOT NULL,  -- Unix ms
  updated_at INTEGER NOT NULL
);

-- Seed row (Inbox cannot be deleted)
INSERT INTO folders VALUES ('inbox', 'Inbox', <ts>, <ts>);

-- Recordings
CREATE TABLE recordings (
  id             TEXT PRIMARY KEY,  -- UUID v4
  folder_id      TEXT NOT NULL REFERENCES folders(id),
  title          TEXT NOT NULL,
  audio_uri      TEXT NOT NULL,     -- file:// path in app documents dir
  transcript_uri TEXT,              -- file:// path to .md file (null until done)
  duration_ms    INTEGER NOT NULL,
  transcription_status TEXT NOT NULL
      CHECK (transcription_status IN ('pending','processing','done','failed')),
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);

CREATE INDEX idx_recordings_folder ON recordings(folder_id);
CREATE INDEX idx_recordings_created ON recordings(created_at DESC);
```

### TypeScript Types

```typescript
export type TranscriptionStatus = 'pending' | 'processing' | 'done' | 'failed';

export interface Folder {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}

export interface Recording {
  id: string;
  folderId: string;
  title: string;
  audioUri: string;
  transcriptUri: string | null;
  durationMs: number;
  transcriptionStatus: TranscriptionStatus;
  createdAt: number;
  updatedAt: number;
}
```

### File Layout (device)

```
<DocumentDirectory>/
  audio/
    <recording-id>.m4a
  transcripts/
    <recording-id>.md
```

---

## 4. Key Flows

### 4.1 Record → Transcribe → Title

```
User taps Record
  └─► RecordScreen mounts, requests mic permission if needed
        └─► RecorderService.start()
              └─► Expo AV begins recording (AAC 128kbps)

User taps Stop
  └─► RecorderService.stop() → { uri, duration }
        └─► Insert recording row (status: 'pending') → StorageService
              └─► TranscriptionService.transcribe(uri)
                    ├─ [online]  → Gemini API → transcript text
                    └─ [offline] → Apple Speech → transcript text
                          └─► Write transcript .md file → FileSystem
                                └─► TitleService.generate(transcript)
                                      ├─ [online]  → Gemini API → title
                                      └─ [offline] → timestamp title
                                            └─► Update recording row
                                                  (title, transcript_uri, status: 'done')
```

### 4.2 Export

```
User taps Export on DetailScreen
  └─► ExportService.export(recording)
        └─► Read transcript .md from FileSystem
              └─► Prepend YAML front-matter (title, date, folder, duration)
                    └─► Write temp .md to cache directory
                          └─► expo-sharing.shareAsync(tempPath)
                                └─► iOS share sheet opens
```

---

## 5. Technology Choices with Rationale

| Technology | Choice | Rationale |
|-----------|--------|-----------|
| Framework | React Native + Expo SDK 51 | Cross-platform foundation; all required native APIs available |
| Routing | Expo Router v3 | File-based; typed routes; modal support |
| Audio | `expo-av` | First-party Expo; stable AAC recording and playback |
| Database | `expo-sqlite` (v2) | Persistent local storage; supports async API; no extra deps |
| File system | `expo-file-system` | Manages audio and transcript files |
| Transcription (cloud) | Gemini 1.5 Flash (free tier) | Free, capable, supports audio input |
| Transcription (offline) | Apple Speech Recognition | On-device; no network; adequate for English v1 |
| Sharing / export | `expo-sharing` | Native share sheet; zero OAuth required |
| Network status | `@react-native-community/netinfo` | Detects online/offline for transcription routing |
| Haptics | `expo-haptics` | Tap feedback on record start/stop |
| Testing | Jest + React Native Testing Library | Standard RN test stack |
| Linting | ESLint + `@typescript-eslint` | Enforces code quality |
| Type checking | TypeScript strict mode | Catches type errors before runtime |

---

## 6. API Contracts

### Gemini Transcription Request

```
POST https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent
Authorization: Bearer $GEMINI_API_KEY
Content-Type: application/json

{
  "contents": [{
    "parts": [
      {
        "inline_data": {
          "mime_type": "audio/mp4",
          "data": "<base64-encoded-audio>"
        }
      },
      { "text": "Transcribe this audio accurately. Return only the transcript text, no commentary." }
    ]
  }]
}
```

Response: `candidates[0].content.parts[0].text`

### Gemini Title Request

```json
{
  "contents": [{
    "parts": [{
      "text": "Generate a meaningful, concise title (max 60 characters) for this voice recording transcript:\n\n{transcript}\n\nReturn only the title, no quotes or punctuation."
    }]
  }]
}
```

### Environment Variables

```
GEMINI_API_KEY=<your-key>
```

Accessed via `expo-constants` / `app.config.js` `extra` field. Never committed to source.

---

## 7. Security

- `GEMINI_API_KEY` stored in `.env` (gitignored); exposed to app via `app.config.js` `extra.geminiApiKey`
- No user data is persisted on any server in v1
- Audio files are in the app's sandboxed documents directory (not accessible to other apps)
- Transcript `.md` files live in the same sandbox
- Stack traces are never shown to users — errors surface as user-friendly messages

---

## 8. Scalability & v2 Considerations

The schema and file layout are designed to make cloud sync straightforward:
- `id` fields are UUIDs (globally unique — safe to sync)
- `created_at` / `updated_at` timestamps enable conflict detection
- `audio_uri` and `transcript_uri` can be swapped for remote URLs post-sync
- Adding a `synced_at` column to `recordings` is the only schema change needed for v2
- Auth can be added as an optional layer without restructuring the local data model

---

## 9. Risks

| Risk | Mitigation |
|------|-----------|
| Gemini base64 audio payload size limit (~20 MB inline) | Chunk long recordings or use File API for > 10 min audio |
| Apple Speech Recognition locale availability | Default to English; surface error if unavailable |
| Expo SDK upgrades breaking `expo-av` recording config | Pin SDK version; test on upgrade |
| SQLite migration failures on app update | Run migrations inside a transaction; rollback on error |
| Background audio interrupted by iOS | Configure `AVAudioSession` category via `expo-av` Audio mode |
