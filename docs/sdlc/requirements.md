# PitchIt — Requirement Clarification Questions

> **Instructions for reviewer:** Fill in each `**Answer:**` field below, then
> approve this PR to continue. You can edit the file directly on the branch, or
> leave your answers as PR review comments (one comment per question). The
> orchestrator will pick up your answers on the next tick.
>
> **There are 10 questions.** Answers to Q1, Q2, Q5, and Q9 have the biggest
> architectural impact — prioritise those if time is short.

---

## Q1: Where do recordings live — local only, or cloud-synced?

The spec says "instant, friction-free capture" but also mentions sharing/export and
AI transcription (which typically requires a server). If recordings are stored only
on-device, the architecture is fully offline-first with no backend. If they sync to
the cloud, we need auth, a storage service (e.g. S3), and a database. Getting this
wrong means rebuilding the data layer from scratch.

**Answer:** 

---

## Q2: Which AI transcription provider — on-device or cloud API?

Transcription can be done on-device (Apple's Speech framework / Whisper.cpp — free,
private, but limited accuracy) or via a cloud API (OpenAI Whisper, AssemblyAI,
Deepgram — higher accuracy, costs money, requires internet). The choice affects
privacy posture, latency, cost model, and whether we need a backend at all.

**Answer:** 

---

## Q3: What does "organize & search" mean — folders, tags, or full-text search?

"Tag, title, and search" leaves the taxonomy open. Options range from simple
free-text titling + keyword search, to a tag/label system (many-to-many), to
folder/project grouping, to full semantic search over transcripts. Each option
has different data model complexity. What's the minimum viable version for v1?

**Answer:** 

---

## Q4: What does "share / export" mean concretely?

This could mean: (a) system share sheet — send audio file to Messages, Mail,
AirDrop, etc.; (b) export to a specific cloud service (Google Drive, Notion,
Dropbox); (c) generate a shareable link hosted by PitchIt. Option (a) is a
single API call. Options (b) and (c) require OAuth integrations or a backend.
Which scope is intended for v1?

**Answer:** 

---

## Q5: Is there user authentication / accounts, or is the app anonymous?

If recordings stay on-device and sharing is via the system share sheet, auth may
be unnecessary. But if cloud sync, shareable links, or cross-device access is
needed, auth is required. Auth adds significant scope (sign-up flow, token
management, account recovery). Should v1 have accounts?

**Answer:** 

---

## Q6: What is the intended recording UX — hold-to-record or toggle?

"One-tap" is ambiguous. It could mean: (a) tap to start / tap to stop (toggle),
(b) press-and-hold to record / release to stop (walkie-talkie style), or (c) a
locked recording screen that stays active until dismissed. Each maps to a different
gesture model and affects the haptics integration. Which interaction model is
intended?

**Answer:** 

---

## Q7: What audio format and quality should recordings be stored in?

Expo AV supports multiple formats (AAC, MP3, WAV, etc.) with configurable
bitrates. For musicians, quality matters (lossless or high-bitrate). For voice
memos, AAC at 128 kbps is fine and keeps file sizes small. The format also
affects AI transcription compatibility. Is there a target quality / format
requirement?

**Answer:** 

---

## Q8: What is the maximum recording length, and is there a storage cap?

Unlimited recordings with no cap could exhaust device storage. Should the app
enforce a per-recording time limit (e.g. 5 min, 30 min), a total storage quota,
or warn the user when storage is low? This affects the recording engine and any
background-processing logic.

**Answer:** 

---

## Q9: Which platforms are in scope — iOS only, or iOS + Android?

React Native / Expo supports both, but Expo AV and permissions behave differently
on Android. The spec says "mobile-only" without specifying. If Android is in scope
from day one, testing and permission-handling complexity roughly doubles. Is v1
iOS-only or cross-platform?

**Answer:** 

---

## Q10: Is there a monetization model that should influence the feature set?

A freemium model (e.g. limited recordings on free tier, unlimited on paid) would
require an entitlement system from the start, which shapes the data model and
onboarding flow. If the app is fully free with no plans for monetization, this
complexity can be deferred. What's the business model?

**Answer:** 
