# PitchIt — Requirements

> Generated from clarifying questions answered 2026-04-13. Approve this PR to
> advance to system design.

---

## 1. Goals and Non-Goals

### Goals (v1)
- **Instant audio capture** — one-tap locked recording screen; stays active until dismissed
- **AI transcription** — on-device (offline) + Gemini API (online), auto-selected by connectivity
- **LLM-generated titles** — meaningful titles produced automatically after recording ends
- **Folder / project organisation** — group recordings into named projects/folders
- **Export as Markdown** — share transcripts as `.md` files via iOS share sheet
- **Local-first storage** — recordings and transcripts stored on-device; cloud sync deferred to v2

### Non-Goals (v1)
- User accounts / authentication
- Cloud sync (designed for later, not built now)
- Android support
- Social features, public profiles, likes
- Real-time collaboration
- Video capture
- Web version
- Monetisation / entitlement system
- Siri integration (noted as future)

---

## 2. Functional Requirements

### FR-001 — Recording
**Description:** The user can start a locked recording session with a single tap.
**Acceptance criteria:**
- Tapping the record button opens a full-screen locked recording view
- Recording starts immediately with haptic feedback on start
- A waveform or timer is visible while recording
- Recording continues until the user taps Stop or Dismiss
- Silence trimming is applied automatically at the start and end of each recording
- No maximum recording length is enforced; the app warns when device storage falls below 500 MB

### FR-002 — Audio storage
**Description:** Each recording is saved to local device storage in an optimal format.
**Acceptance criteria:**
- Audio is encoded as AAC at 128 kbps (compatible with on-device and Gemini transcription)
- File is saved to the app's sandboxed documents directory
- Metadata (duration, date, folder) is persisted in a local SQLite database via Expo SQLite
- Files are retained locally until the user deletes them or cloud sync (v2) removes them

### FR-003 — Transcription (dual-mode)
**Description:** Every recording is automatically transcribed after it ends.
**Acceptance criteria:**
- When online: transcription is sent to Gemini API; result stored as Markdown
- When offline: Apple Speech Recognition (on-device) is used as fallback
- Transcription mode is selected automatically based on network reachability
- If both fail, recording is saved without transcript and retried when connectivity returns
- Transcript is stored as a `.md` file alongside the audio file

### FR-004 — LLM-generated title
**Description:** A meaningful title is generated for each recording using an LLM.
**Acceptance criteria:**
- After transcription completes, Gemini API is called with the transcript to produce a short title (≤ 60 chars)
- If offline, a timestamp-based title is used (e.g. `Recording – Apr 13, 2026 10:32`)
- The user can rename the title at any time
- Title is stored in the local database

### FR-005 — Folder / project organisation
**Description:** Recordings are grouped into folders (projects).
**Acceptance criteria:**
- A default "Inbox" folder exists and cannot be deleted
- Users can create, rename, and delete custom folders
- Deleting a folder moves its recordings to Inbox (no orphan recordings)
- Each recording belongs to exactly one folder
- The home screen shows a list of folders with recording count

### FR-006 — Playback
**Description:** Users can play back any recording from the library.
**Acceptance criteria:**
- Tap a recording to open a playback screen with play/pause, scrub bar, and transcript
- Playback speed is adjustable (0.75×, 1×, 1.25×, 1.5×, 2×)
- Playback state is preserved if the user backgrounds the app

### FR-007 — Export as Markdown
**Description:** Users can export a recording's transcript as a `.md` file.
**Acceptance criteria:**
- Export option appears in the recording detail screen
- Tapping Export opens the iOS share sheet with the `.md` file attached
- The Markdown file includes: title, date, folder, duration, and full transcript
- Export does not require internet access

### FR-008 — Delete recording
**Description:** Users can delete individual recordings.
**Acceptance criteria:**
- Swipe-to-delete and a detail-screen delete button are both supported
- A confirmation prompt is shown before deletion
- Deleting a recording removes the audio file and transcript from local storage
- Deletion is not reversible

---

## 3. Non-Functional Requirements

| ID | Requirement |
|----|-------------|
| NFR-001 | Time-to-record ≤ 1 second from tapping the record button |
| NFR-002 | App launches to record-ready state in ≤ 2 seconds on iPhone 12 or newer |
| NFR-003 | Transcription completes within 10 seconds for a 1-minute recording (online) |
| NFR-004 | App does not crash or lose audio if backgrounded during recording |
| NFR-005 | All API keys stored in environment variables / secure storage — never in source |
| NFR-006 | iOS 16+ only (aligns with Expo SDK 51+ support matrix) |
| NFR-007 | App functions fully offline except for Gemini transcription and LLM titling |
| NFR-008 | No user data is sent to third-party services other than Gemini (opt-in, online-only) |

---

## 4. Constraints and Assumptions

| # | Constraint / Assumption |
|---|------------------------|
| C-1 | iOS only for v1 — no Android build |
| C-2 | No backend or auth in v1; all data is local |
| C-3 | Gemini free tier is the only cloud API; no fallback cloud service |
| C-4 | Cloud sync is a v2 feature; data model must be designed to accommodate it without breaking changes |
| C-5 | Audio is deleted from device when cloud sync eventually happens (v2); local storage is not a permanent archive |
| C-6 | Multi-language transcription is a future concern; v1 targets English |
| C-7 | The app is for personal use; no multi-user or sharing features in v1 |

---

## 5. Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Gemini API rate limits for free tier | Medium | Medium | Cache transcription results; show clear error with retry |
| On-device Speech Recognition accuracy for accented/fast speech | Medium | Medium | Let user edit transcript manually |
| iOS microphone permission denial | Low | High | Clear permission rationale screen before first recording |
| Large audio files exhausting device storage | Low | Medium | Warn at < 500 MB free; surface storage info in settings |
| Apple Speech Recognition unavailable in certain locales | Low | Low | Fallback to raw audio save with deferred transcription |

---

## 6. Success Metrics / Definition of Done

A feature is **done** when:
1. It is implemented as specified above
2. Unit tests pass (Jest + React Native Testing Library)
3. Manual golden-path test passes on iOS Simulator and a physical device
4. No TypeScript errors (`tsc --noEmit`)
5. ESLint passes with zero warnings
6. Docs / comments updated for any public module

**v1 is shippable when:**
- FR-001 through FR-008 are all done
- Time-to-record (NFR-001) is verified on device
- App does not crash on backgrounding during recording
- Export produces valid Markdown readable by standard tools
