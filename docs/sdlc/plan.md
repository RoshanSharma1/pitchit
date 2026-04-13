# PitchIt — Task Plan

> Derived from `docs/sdlc/requirements.md` and `docs/sdlc/design.md`.
> Tasks are ordered by dependency. Implement in sequence unless noted.

---

## TASK-001: Expo project bootstrap

- **Size:** S
- **Dependencies:** none
- **Description:** Initialise a new Expo SDK 51 project with TypeScript strict
  mode, Expo Router v3, ESLint (`@typescript-eslint`), and Jest + React Native
  Testing Library. Configure `app.config.js` to read `GEMINI_API_KEY` from
  `.env` via `extra`. Add `.env` to `.gitignore`. Set up folder structure:
  `src/screens/`, `src/services/`, `src/db/`, `src/hooks/`, `src/types/`.
- **Tests:** `npx tsc --noEmit` passes; `npx eslint .` passes; `jest` runs
  with zero test files and exits 0.
- **Status:** [ ] pending

---

## TASK-002: TypeScript types and constants

- **Size:** S
- **Dependencies:** TASK-001
- **Description:** Create `src/types/index.ts` with `Folder`, `Recording`, and
  `TranscriptionStatus` types exactly as specified in the design doc. Add
  `src/constants.ts` with `INBOX_FOLDER_ID = 'inbox'` and
  `MAX_RECORDING_DURATION_MS = 10 * 60 * 1000`.
- **Tests:** Unit test that `TranscriptionStatus` union exhaustively covers all
  five values; type-check passes.
- **Status:** [ ] pending

---

## TASK-003: SQLite StorageService and migrations

- **Size:** M
- **Dependencies:** TASK-002
- **Description:** Implement `src/db/StorageService.ts`. On first call, run
  migrations inside a transaction: create `folders` and `recordings` tables
  exactly per the design schema, seed the Inbox row. Expose typed async
  functions:
  - `getFolders()` — active folders with recording count
  - `getRecordingsForFolder(folderId)` — active recordings ordered by `created_at DESC`
  - `getRecording(id)`
  - `insertRecording(recording)`
  - `updateRecording(id, patch)`
  - `softDeleteRecording(id)` — sets `deleted_at`
  - `recoverStuckRecordings()` — resets `processing` → `pending`
  - `insertFolder(folder)`, `updateFolder(id, patch)`, `deleteFolder(id)` (moves recordings to Inbox first)
- **Tests:** Jest tests covering: migration runs without error; Inbox is seeded;
  CRUD round-trips; soft delete hides row; `recoverStuckRecordings` resets
  stuck rows; deleting a folder moves recordings to Inbox.
- **Status:** [ ] pending

---

## TASK-004: FolderService

- **Size:** S
- **Dependencies:** TASK-003
- **Description:** Implement `src/services/FolderService.ts`. Wraps
  `StorageService` with business rules:
  - `getFolders()` — delegates to StorageService
  - `createFolder(name)` — validates name non-empty, generates UUID
  - `renameFolder(id, name)` — rejects rename of system folder name to blank
  - `deleteFolder(id)` — rejects if `is_system = 1`; moves recordings to Inbox
- **Tests:** Unit tests for each rule: blank name rejected; system folder
  delete rejected; recordings moved on delete.
- **Status:** [ ] pending

---

## TASK-005: RecorderService

- **Size:** M
- **Dependencies:** TASK-002
- **Description:** Implement `src/services/RecorderService.ts` using `expo-av`.
  - `requestPermission()` — wraps `Audio.requestPermissionsAsync()`
  - `start()` — configures AAC 128 kbps mono `.m4a`; starts recording; sets up
    timer that emits `onWarning` at 9 min and calls `stop()` at 10 min
  - `stop()` → `{ uri: string, durationMs: number }`
  - `onDurationTick(cb)` — fires every second with elapsed ms
  - `onWarning(cb)` — fires at 9-minute mark
- **Tests:** Mock `expo-av`; verify: permission requested on `start()`; stop
  returns URI and duration; 10-min auto-stop fires; warning fires at 9 min.
- **Status:** [ ] pending

---

## TASK-006: TranscriptionService

- **Size:** M
- **Dependencies:** TASK-002
- **Description:** Implement `src/services/TranscriptionService.ts`.
  - `isOnline()` — uses `@react-native-community/netinfo`
  - `transcribe(audioUri)` → `{ text: string }` or throws typed error
  - Reads audio file via `expo-file-system`, base64-encodes it
  - POSTs to Gemini 1.5 Flash endpoint with `GEMINI_API_KEY` from
    `Constants.expoConfig.extra.geminiApiKey`
  - Maps API errors to typed `error_code` values:
    `NETWORK_ERROR`, `API_LIMIT`, `API_ERROR`, `FILE_ERROR`
- **Tests:** Mock `expo-file-system` and `fetch`; verify: correct Gemini
  payload shape; transcript text extracted from response; each error code
  mapped correctly.
- **Status:** [ ] pending

---

## TASK-007: TitleService

- **Size:** S
- **Dependencies:** TASK-006
- **Description:** Implement `src/services/TitleService.ts`.
  - `generate(transcript)` → `string`
  - If online: calls Gemini with title prompt; truncates to 60 chars
  - If offline or API fails: returns `"Recording – {MMM D, YYYY h:mm A}"`
- **Tests:** Mock fetch; verify: title truncated to 60 chars; offline fallback
  returns timestamp format; API failure returns fallback.
- **Status:** [ ] pending

---

## TASK-008: ExportService

- **Size:** S
- **Dependencies:** TASK-003
- **Description:** Implement `src/services/ExportService.ts`.
  - `export(recording: Recording)` — builds Markdown string with YAML
    front-matter (title, date, folder name, duration), appends transcript text,
    writes to `CacheDirectory/<id>.md`, calls `expo-sharing.shareAsync()`
- **Tests:** Verify Markdown output matches expected format for a sample
  recording; sharing called with correct path.
- **Status:** [ ] pending

---

## TASK-009: RecordingPipeline orchestrator

- **Size:** M
- **Dependencies:** TASK-003, TASK-005, TASK-006, TASK-007
- **Description:** Implement `src/services/RecordingPipeline.ts` — the single
  coordinator for the record → persist → transcribe → title lifecycle.
  - `start()` — delegates to RecorderService
  - `stop(folderId)` — stops recorder; inserts row (status `pending`); calls
    `_process(id)` async
  - `_process(id)` — if online: transcribe → update transcript + status `done`
    → generate title → update title; if offline: set status `queued`
  - `retryQueued()` — called by NetInfo `connected` listener and on app launch
    after `recoverStuckRecordings()`; processes all `pending`/`queued` rows
  - `onRecordingUpdate(cb)` — event emitter for UI to react to status changes
- **Tests:** Mock all services; verify: offline path sets `queued`; online path
  runs full pipeline; title failure still saves transcript; `retryQueued`
  processes pending rows; partial failure sets correct `error_code`.
- **Status:** [ ] pending

---

## TASK-010: HomeScreen — folder list

- **Size:** M
- **Dependencies:** TASK-004
- **Description:** Implement `app/index.tsx` (HomeScreen).
  - Lists folders from `FolderService.getFolders()`
  - Shows folder name + recording count
  - FAB (floating action button) navigates to `/record`
  - Long-press on folder: rename / delete options (system folder shows rename
    only)
  - Pull-to-refresh
- **Tests:** RNTL: renders folder list; FAB navigates to record route; system
  folder delete option absent; rename updates list.
- **Status:** [ ] pending

---

## TASK-011: FolderScreen — recording list

- **Size:** M
- **Dependencies:** TASK-003, TASK-009
- **Description:** Implement `app/folder/[id].tsx`.
  - Lists recordings for the folder ordered by `created_at DESC`
  - Each row: title, duration, transcription status badge, date
  - Swipe-left to delete (soft delete + audio file removal)
  - Tap to navigate to `/recording/[id]`
  - Subscribes to `RecordingPipeline.onRecordingUpdate` to reflect live status
- **Tests:** RNTL: recordings rendered; status badge updates on pipeline event;
  swipe-delete calls softDelete and removes row from list.
- **Status:** [ ] pending

---

## TASK-012: RecordScreen — locked recording UI

- **Size:** M
- **Dependencies:** TASK-009
- **Description:** Implement `app/record.tsx` (modal screen).
  - Requests mic permission on mount; shows permission-denied state if refused
  - Calls `RecordingPipeline.start()` on mount
  - Displays elapsed timer (MM:SS) and a simple amplitude waveform bar
  - Shows warning banner at 9-minute mark
  - Stop button calls `RecordingPipeline.stop(folderId)` then dismisses modal
  - Haptic feedback on start and stop via `expo-haptics`
- **Tests:** RNTL: permission denied state shown; timer increments; stop
  button calls pipeline stop; haptic called on start and stop.
- **Status:** [ ] pending

---

## TASK-013: DetailScreen — playback, transcript, export

- **Size:** M
- **Dependencies:** TASK-008, TASK-009
- **Description:** Implement `app/recording/[id].tsx`.
  - Loads recording from StorageService
  - Playback: play/pause, scrub bar, speed selector (0.75×, 1×, 1.25×, 1.5×,
    2×) via `expo-av`
  - Transcript section: shows `transcript_text` or status message if pending
  - Rename: inline edit of title
  - Export button: calls `ExportService.export(recording)` (only active when
    `transcriptionStatus === 'done'`)
  - Delete button: soft delete → navigate back to FolderScreen
  - Subscribes to `RecordingPipeline.onRecordingUpdate` for live transcript
    arrival
- **Tests:** RNTL: playback controls present; export disabled when pending;
  rename updates title; delete navigates back.
- **Status:** [ ] pending

---

## TASK-014: App launch recovery + NetInfo retry wiring

- **Size:** S
- **Dependencies:** TASK-009
- **Description:** In the root layout (`app/_layout.tsx`):
  - On mount: call `StorageService.recoverStuckRecordings()` then
    `RecordingPipeline.retryQueued()`
  - Subscribe to `NetInfo` — call `RecordingPipeline.retryQueued()` whenever
    `isConnected` transitions to `true`
  - Unsubscribe on unmount
- **Tests:** Unit test that `recoverStuckRecordings` + `retryQueued` are called
  on mount; NetInfo listener triggers retry on reconnect.
- **Status:** [ ] pending

---

## TASK-015: End-to-end integration smoke test

- **Size:** S
- **Dependencies:** TASK-001 through TASK-014
- **Description:** Write a Jest integration test that wires real
  `StorageService` (in-memory SQLite) with mocked `RecorderService`,
  `TranscriptionService`, and `TitleService` to verify the full pipeline:
  record → insert `pending` → transcribe → update to `done` with transcript
  and title → soft delete removes row from active list.
- **Tests:** The integration test itself.
- **Status:** [ ] pending
