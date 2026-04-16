# PitchIt

Instant, friction-free audio capture for solo creators. Record ideas, get automatic transcriptions and AI-generated titles, organise into folders, and export as Markdown.

> **Platform:** iOS only (v1). React Native + Expo SDK 51.

---

## Prerequisites

| Tool | Version |
|------|---------|
| Node.js | 18 or later |
| npm | 9 or later |
| Expo CLI | installed via `npx` (no global install needed) |
| Xcode | 15 or later (for iOS Simulator or device) |
| iOS Simulator | included with Xcode |

---

## Installation

```bash
# 1. Clone the repo
git clone https://github.com/RoshanSharma1/pitchit.git
cd pitchit

# 2. Install dependencies
npm install

# 3. Set up environment variables
cp .env.example .env
# Edit .env and add your Gemini API key (see "API Key" below)
```

### API Key

Transcription and title generation use the [Gemini 1.5 Flash API](https://ai.google.dev/) (free tier).

1. Go to https://aistudio.google.com/app/apikey and create a key.
2. Add it to `.env`:

```
GEMINI_API_KEY=your_key_here
```

> **Note:** The key is bundled in the app binary. This is fine for personal use — do not distribute the app publicly with a real key.

---

## Running the App

### iOS Simulator (recommended)

```bash
npm run ios
```

This opens Expo in the iOS Simulator. The first launch takes ~30 seconds to build.

### Physical iPhone

1. Install the [Expo Go](https://apps.apple.com/app/expo-go/id982107779) app on your iPhone.
2. Run:

```bash
npm start
```

3. Scan the QR code with your iPhone camera.

> Microphone permission is required. iOS will prompt on first recording.

---

## Project Structure

```
app/                    Expo Router screens
  _layout.tsx           Root layout — recovery wiring, route registration
  index.tsx             HomeScreen — folder list
  folder/[id].tsx       FolderScreen — recordings in a folder
  record.tsx            RecordScreen — locked recording modal
  recording/[id].tsx    DetailScreen — playback, transcript, export

src/
  db/
    StorageService.ts   SQLite persistence layer
  services/
    RecordingPipeline.ts  Orchestrates record → transcribe → title
    RecorderService.ts    expo-av recording wrapper
    TranscriptionService.ts  Gemini transcription
    TitleService.ts       Gemini title generation
    ExportService.ts      Markdown export + share sheet
    FolderService.ts      Folder business rules
  types/index.ts        Shared TypeScript types
  constants.ts          App-wide constants

docs/
  sdlc/                 Requirements, design, and task plan
  ux.md                 Screen wireframes and interaction spec
```

---

## Testing

### Run all tests

```bash
npm test
```

91 tests across 14 suites. All tests run without a device or simulator — they use in-memory fakes for SQLite and mocks for all native modules.

### Run a specific test file

```bash
npx jest StorageService          # unit tests for the DB layer
npx jest RecordingPipeline       # pipeline orchestration tests
npx jest integration             # end-to-end smoke test
npx jest HomeScreen FolderScreen # screen tests
```

### Type checking

```bash
npm run typecheck
```

### Linting

```bash
npm run lint
```

### Test coverage areas

| Suite | What it covers |
|-------|---------------|
| `StorageService` | SQLite migrations, CRUD, soft delete, stuck-recording recovery |
| `FolderService` | Business rules: blank names, system folder protection |
| `RecorderService` | expo-av wrapper, timers, auto-stop at 10 min |
| `TranscriptionService` | Gemini API call, error code mapping |
| `TitleService` | Title generation, offline fallback |
| `ExportService` | Markdown output format, share sheet call |
| `RecordingPipeline` | Online/offline paths, retry, partial failure handling |
| `HomeScreen` | Folder list render, FAB navigation, rename/delete |
| `FolderScreen` | Recording list, live status badge updates, swipe-delete |
| `RecordScreen` | Permission gate, timer, stop button, haptics |
| `DetailScreen` | Playback controls, export gating, rename, delete |
| `RootLayout` | Launch recovery, NetInfo retry wiring |
| `integration` | Full pipeline: record → transcribe → title → soft delete |

---

## Key Behaviours

- **Offline recording** — recordings are always saved locally; transcription is queued until network is available.
- **Auto-retry** — on app launch and whenever connectivity is restored, queued recordings are processed automatically.
- **Crash recovery** — any recording stuck in `processing` at launch is reset to `pending` and retried.
- **10-minute cap** — recording stops automatically at 10 minutes with a warning at 9 minutes.
- **Export** — generates a Markdown file with YAML front-matter (title, date, folder, duration) and opens the iOS share sheet.
