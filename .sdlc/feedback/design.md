
---
# Design Review: PitchIt (Original Design)

## Overall Assessment

The design is **strong for a v1 concept** — it is clear, modular, and implementation-oriented. It shows good thinking around:
- Local-first architecture
- Clean service separation
- Simple and extensible data model
- Thoughtful user flows

However, there are a few **critical gaps between design and real-world implementation**, especially around:
- Offline transcription feasibility
- Security (API key exposure)
- File vs database responsibilities
- Failure handling and lifecycle management

This review highlights strengths and provides concrete improvements (many reflected in the revised version).

---

## ✅ Strengths

### 1. Clear Architecture Separation
- UI → Services → Storage / APIs is clean and scalable
- Services are well-defined and testable
- Expo-first approach is appropriate for speed

**Impact:** Easy to reason about, maintain, and extend

---

### 2. Local-First Design (Correct for v1)
- No dependency on backend for core functionality
- Works offline for recording and playback
- Good user experience baseline

**Impact:** Faster development, fewer infra dependencies

---

### 3. Simple and Effective Data Model
- `folders` and `recordings` tables are minimal and sufficient
- UUID usage is future-proof for sync
- Status-based processing is a good pattern

**Impact:** Avoids over-engineering while remaining extensible

---

### 4. Thoughtful End-to-End Flow
- Record → Save → Transcribe → Title is well structured
- Early persistence (`pending` state) is correct
- Async processing model is appropriate

**Impact:** Good UX and resilient pipeline foundation

---

### 5. Export Design is Clean
- Markdown export with metadata is a strong choice
- Share sheet integration is simple and effective

**Impact:** Immediate user value without backend complexity

---

## ⚠️ Key Issues & Gaps

### 1. ❌ Offline Transcription is Not Feasible as Designed

**Problem**
- Design references Apple Speech via `expo-speech`, which is incorrect
- Expo does not provide reliable offline speech-to-text out of the box

**Impact**
- This is the biggest implementation risk
- Will block development or require unexpected native work

**Recommendation**
- Remove offline transcription from v1
- Replace with:
  - Offline recording
  - Transcription queued until network is available

---

### 2. ❌ API Key Exposure (Security Risk)

**Problem**
- Gemini API key is exposed via `app.config.js`
- This is accessible in the client bundle

**Impact**
- Key can be extracted and abused
- Not safe for production

**Recommendation**
- Introduce a backend proxy:
  - Mobile → Backend → Gemini
- If skipped for v1:
  - Explicitly mark as **prototype-only**
  - Accept risk temporarily

---

### 3. ⚠️ Transcript Stored as File Instead of Source of Truth

**Problem**
- Transcript is stored as `.md` file and referenced via `transcript_uri`
- DB does not contain transcript text

**Impact**
- File corruption = data loss
- Harder to:
  - Search
  - Render UI
  - Debug issues

**Recommendation**
- Store transcript in SQLite (`transcript_text`)
- Generate Markdown only during export

---

### 4. ⚠️ No Orchestration Layer

**Problem**
- Flow spans multiple services but no single coordinator exists

**Impact**
- Hard to manage:
  - retries
  - state transitions
  - partial failures

**Recommendation**
- Introduce `RecordingService` (or pipeline service)
- Owns:
  - lifecycle
  - retries
  - recovery

---

### 5. ⚠️ Weak Failure Handling Model

**Problem**
- Only one status field (`pending`, `processing`, etc.)
- No distinction between transcription vs title failures
- No retry strategy defined

**Impact**
- Inconsistent states
- Difficult debugging
- Poor UX on failure

**Recommendation**
- Expand processing states OR support partial success
- Add:
  - `error_code`
  - `error_message`
- Allow:
  - transcript success even if title fails

---

### 6. ⚠️ No Startup Recovery Mechanism

**Problem**
- No handling for app interruption during processing

**Impact**
- Items can get stuck in `processing` forever

**Recommendation**
On app launch:
- Reset `processing` → `pending`
- Retry if network available

---

### 7. ⚠️ Silence Trimming is Over-Scoped

**Problem**
- “Amplitude threshold trimming” is mentioned but not defined

**Impact**
- Adds DSP complexity
- Not core to product value

**Recommendation**
- Remove from v1
- Revisit in v2 if needed

---

### 8. ⚠️ File + DB Consistency Not Fully Defined

**Problem**
- Audio and transcript stored separately from DB
- No clear lifecycle rules

**Impact**
- Orphaned files
- Broken references

**Recommendation**
Define:
- Delete behavior (hard vs soft)
- Cleanup strategy
- File naming guarantees

---

### 9. ⚠️ Recording Length vs API Constraints Mismatch

**Problem**
- Design allows arbitrary recording length
- Gemini inline audio has size limits

**Impact**
- Failures for longer recordings

**Recommendation**
- Define explicit limit:
  - e.g., 10 minutes max
- Warn user near limit

---

### 10. ⚠️ Inbox Protection Not Enforced at Data Layer

**Problem**
- Inbox “cannot be deleted” is not enforced structurally

**Impact**
- Risk of accidental deletion logic bugs

**Recommendation**
- Add `is_system` flag OR enforce via service layer strictly

---

## 🔧 Recommended Improvements (v1-Ready)

### Simplify v1 Scope

**Keep:**
- Recording (offline)
- Local storage
- Folder organization
- Online transcription
- Title generation
- Export

**Remove / defer:**
- Offline transcription
- Silence trimming
- Long recordings
- Background processing

---

### Improve Data Model

Add:
```sql
transcript_text TEXT
error_code TEXT
error_message TEXT
deleted_at INTEGER

---
# Design Review: PitchIt (Original Design)

## Overall Assessment

The design is **strong for a v1 concept** — it is clear, modular, and implementation-oriented. It shows good thinking around:
- Local-first architecture
- Clean service separation
- Simple and extensible data model
- Thoughtful user flows

However, there are a few **critical gaps between design and real-world implementation**, especially around:
- Offline transcription feasibility
- Security (API key exposure)
- File vs database responsibilities
- Failure handling and lifecycle management

This review highlights strengths and provides concrete improvements (many reflected in the revised version).

---

## ✅ Strengths

### 1. Clear Architecture Separation
- UI → Services → Storage / APIs is clean and scalable
- Services are well-defined and testable
- Expo-first approach is appropriate for speed

**Impact:** Easy to reason about, maintain, and extend

---

### 2. Local-First Design (Correct for v1)
- No dependency on backend for core functionality
- Works offline for recording and playback
- Good user experience baseline

**Impact:** Faster development, fewer infra dependencies

---

### 3. Simple and Effective Data Model
- `folders` and `recordings` tables are minimal and sufficient
- UUID usage is future-proof for sync
- Status-based processing is a good pattern

**Impact:** Avoids over-engineering while remaining extensible

---

### 4. Thoughtful End-to-End Flow
- Record → Save → Transcribe → Title is well structured
- Early persistence (`pending` state) is correct
- Async processing model is appropriate

**Impact:** Good UX and resilient pipeline foundation

---

### 5. Export Design is Clean
- Markdown export with metadata is a strong choice
- Share sheet integration is simple and effective

**Impact:** Immediate user value without backend complexity

---

## ⚠️ Key Issues & Gaps

### 1. ❌ Offline Transcription is Not Feasible as Designed

**Problem**
- Design references Apple Speech via `expo-speech`, which is incorrect
- Expo does not provide reliable offline speech-to-text out of the box

**Impact**
- This is the biggest implementation risk
- Will block development or require unexpected native work

**Recommendation**
- Remove offline transcription from v1
- Replace with:
  - Offline recording
  - Transcription queued until network is available

---

### 2. ❌ API Key Exposure (Security Risk)

**Problem**
- Gemini API key is exposed via `app.config.js`
- This is accessible in the client bundle

**Impact**
- Key can be extracted and abused
- Not safe for production

**Recommendation**
- Introduce a backend proxy:
  - Mobile → Backend → Gemini
- If skipped for v1:
  - Explicitly mark as **prototype-only**
  - Accept risk temporarily

---

### 3. ⚠️ Transcript Stored as File Instead of Source of Truth

**Problem**
- Transcript is stored as `.md` file and referenced via `transcript_uri`
- DB does not contain transcript text

**Impact**
- File corruption = data loss
- Harder to:
  - Search
  - Render UI
  - Debug issues

**Recommendation**
- Store transcript in SQLite (`transcript_text`)
- Generate Markdown only during export

---

### 4. ⚠️ No Orchestration Layer

**Problem**
- Flow spans multiple services but no single coordinator exists

**Impact**
- Hard to manage:
  - retries
  - state transitions
  - partial failures

**Recommendation**
- Introduce `RecordingService` (or pipeline service)
- Owns:
  - lifecycle
  - retries
  - recovery

---

### 5. ⚠️ Weak Failure Handling Model

**Problem**
- Only one status field (`pending`, `processing`, etc.)
- No distinction between transcription vs title failures
- No retry strategy defined

**Impact**
- Inconsistent states
- Difficult debugging
- Poor UX on failure

**Recommendation**
- Expand processing states OR support partial success
- Add:
  - `error_code`
  - `error_message`
- Allow:
  - transcript success even if title fails

---

### 6. ⚠️ No Startup Recovery Mechanism

**Problem**
- No handling for app interruption during processing

**Impact**
- Items can get stuck in `processing` forever

**Recommendation**
On app launch:
- Reset `processing` → `pending`
- Retry if network available

---

### 7. ⚠️ Silence Trimming is Over-Scoped

**Problem**
- “Amplitude threshold trimming” is mentioned but not defined

**Impact**
- Adds DSP complexity
- Not core to product value

**Recommendation**
- Remove from v1
- Revisit in v2 if needed

---

### 8. ⚠️ File + DB Consistency Not Fully Defined

**Problem**
- Audio and transcript stored separately from DB
- No clear lifecycle rules

**Impact**
- Orphaned files
- Broken references

**Recommendation**
Define:
- Delete behavior (hard vs soft)
- Cleanup strategy
- File naming guarantees

---

### 9. ⚠️ Recording Length vs API Constraints Mismatch

**Problem**
- Design allows arbitrary recording length
- Gemini inline audio has size limits

**Impact**
- Failures for longer recordings

**Recommendation**
- Define explicit limit:
  - e.g., 10 minutes max
- Warn user near limit

---

### 10. ⚠️ Inbox Protection Not Enforced at Data Layer

**Problem**
- Inbox “cannot be deleted” is not enforced structurally

**Impact**
- Risk of accidental deletion logic bugs

**Recommendation**
- Add `is_system` flag OR enforce via service layer strictly

---

## 🔧 Recommended Improvements (v1-Ready)

### Simplify v1 Scope

**Keep:**
- Recording (offline)
- Local storage
- Folder organization
- Online transcription
- Title generation
- Export

**Remove / defer:**
- Offline transcription
- Silence trimming
- Long recordings
- Background processing

---

### Improve Data Model

Add:
```sql
transcript_text TEXT
error_code TEXT
error_message TEXT
deleted_at INTEGER
