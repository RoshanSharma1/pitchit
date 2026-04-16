# PitchIt — UX Specification

> Covers all four screens: HomeScreen, FolderScreen, RecordScreen, DetailScreen.
> Each section defines: ASCII wireframe, key UI elements, interaction states,
> and navigation transitions.

---

## 1. HomeScreen (`/`)

### Wireframe

```
┌─────────────────────────────┐
│  PitchIt              [···] │  ← nav bar; [···] = settings (future)
├─────────────────────────────┤
│                             │
│  ┌─────────────────────┐    │
│  │ 📁 Inbox        12  │    │  ← system folder (no delete)
│  └─────────────────────┘    │
│  ┌─────────────────────┐    │
│  │ 📁 Song Ideas        3  │ │
│  └─────────────────────┘    │
│  ┌─────────────────────┐    │
│  │ 📁 Podcast Notes     7  │ │
│  └─────────────────────┘    │
│                             │
│                             │
│                      [  ●  ]│  ← FAB, bottom-right
└─────────────────────────────┘
```

### Key UI Elements

| Element | Detail |
|---------|--------|
| Folder row | Folder icon + name (left), recording count badge (right) |
| FAB | Large circular button, bottom-right, navigates to RecordScreen |
| Long-press menu | Sheet with **Rename** / **Delete** (Delete absent for system folders) |
| Pull-to-refresh | Reloads folder list from StorageService |

### Interaction States

| State | UI |
|-------|----|
| Empty (no folders beyond Inbox) | Inbox row only; hint text: "Tap ● to record your first idea" |
| Loading | Skeleton rows (3 placeholder rows) |
| Long-press on user folder | Bottom sheet: Rename, Delete |
| Long-press on Inbox | Bottom sheet: Rename only |
| Delete confirm | Alert: "Delete 'Song Ideas'? Recordings will move to Inbox." |

### Navigation

- Tap folder row → FolderScreen (`/folder/[id]`)
- Tap FAB → RecordScreen (`/record`, modal)

---

## 2. FolderScreen (`/folder/[id]`)

### Wireframe

```
┌─────────────────────────────┐
│  ← Inbox              [···] │  ← back to HomeScreen
├─────────────────────────────┤
│                             │
│  ┌─────────────────────┐    │
│  │ Guitar riff idea    │    │
│  │ 0:42  ● done   Apr 15│   │  ← recording row
│  └─────────────────────┘    │
│  ┌─────────────────────┐    │
│  │ Podcast intro draft │    │
│  │ 2:10  ◌ pending Apr 14│  │
│  └─────────────────────┘    │
│  ┌─────────────────────┐    │
│  │ Melody sketch       │    │
│  │ 1:05  ⚠ failed  Apr 13│  │
│  └─────────────────────┘    │
│                             │
└─────────────────────────────┘
```

### Recording Row Anatomy

```
┌──────────────────────────────────────────┐
│ Title (truncated to 1 line)              │
│ Duration   [STATUS BADGE]   Date         │
└──────────────────────────────────────────┘
```

### Status Badge Design

| Status | Badge | Colour | Icon |
|--------|-------|--------|------|
| `pending` | "pending" | Grey `#8E8E93` | ◌ clock |
| `queued` | "queued" | Blue `#007AFF` | ↑ upload |
| `processing` | "processing" | Orange `#FF9500` | ⟳ spinner |
| `done` | "done" | Green `#34C759` | ● filled circle |
| `failed` | "failed" | Red `#FF3B30` | ⚠ warning |

Badge is a pill-shaped label: `[icon] text`, 12 pt, rounded corners.

### Interaction States

| State | UI |
|-------|----|
| Empty folder | Centred text: "No recordings yet. Tap ● to start." |
| Loading | Skeleton rows |
| Swipe-left on row | Red "Delete" action revealed |
| Delete confirm | Alert: "Delete recording? This cannot be undone." |
| Live status update | Badge animates to new state when pipeline emits update |

### Navigation

- Tap row → DetailScreen (`/recording/[id]`)
- Back → HomeScreen

---

## 3. RecordScreen (`/record`, modal)

### Wireframe

```
┌─────────────────────────────┐
│                        [✕]  │  ← disabled during recording; enabled after stop
├─────────────────────────────┤
│                             │
│                             │
│   ▁▂▄▆▄▂▁▃▅▃▁▂▄▂▁          │  ← amplitude waveform bar (scrolling)
│                             │
│         00:42               │  ← elapsed timer MM:SS, centred
│                             │
│                             │
│  ┌─────────────────────┐    │
│  │  ⚠ 1 min remaining  │    │  ← warning banner (visible at 9:00+)
│  └─────────────────────┘    │
│                             │
│         [  ■  ]             │  ← stop button, centred, 72 pt diameter
│                             │
└─────────────────────────────┘
```

### Key UI Elements

| Element | Detail |
|---------|--------|
| Waveform bar | Horizontal scrolling amplitude bars; updates every 100 ms |
| Timer | `MM:SS` centred; updates every second |
| Warning banner | Yellow bar, appears at 9:00, text: "⚠ 1 min remaining" |
| Stop button | 72 pt circle, red fill, white square icon; single tap stops |
| Dismiss (✕) | Top-right; disabled (greyed) while recording; enabled after stop |

### Interaction States

| State | UI |
|-------|----|
| Permission denied | Full-screen message: "Microphone access required." + Settings button |
| Recording active | Waveform animating, timer counting, stop button enabled |
| 9-minute mark | Warning banner slides in from top |
| 10-minute cap | Recording auto-stops; haptic; dismiss enabled |
| Stop tapped | Haptic feedback; spinner briefly shown; modal dismisses |

### Haptics

- Recording starts → `Haptics.impactAsync(Heavy)`
- Recording stops → `Haptics.notificationAsync(Success)`

### Navigation

- Dismiss (after stop) → back to previous screen (HomeScreen or FolderScreen)
- Auto-dismiss after 10-min cap → same

---

## 4. DetailScreen (`/recording/[id]`)

### Wireframe

```
┌─────────────────────────────┐
│  ← Guitar riff idea   [···] │  ← [···] = rename / delete menu
├─────────────────────────────┤
│                             │
│  ──────────●────────────    │  ← scrub bar; ● = playhead
│  0:18              0:42     │  ← elapsed / total
│                             │
│  [  ◀◀  ] [  ▶  ] [  ▶▶  ] │  ← rewind 10s, play/pause, forward 10s
│                             │
│  Speed: [0.75] [1×] [1.25] [1.5] [2×]  │  ← speed selector
│                             │
├─────────────────────────────┤
│  Transcript                 │
│                             │
│  "So I had this idea for a  │
│   guitar riff that goes..."  │
│                             │
│  [  Export  ]               │  ← disabled when status ≠ done
└─────────────────────────────┘
```

### Key UI Elements

| Element | Detail |
|---------|--------|
| Scrub bar | Slider; drag to seek; shows elapsed / total below |
| Playback controls | Rewind 10 s, Play/Pause, Forward 10 s |
| Speed selector | 5 segmented options; active option highlighted |
| Transcript section | Scrollable text area below playback |
| Export button | Full-width button; disabled (greyed) until `status === 'done'` |
| `[···]` menu | Sheet: **Rename** (inline title edit), **Delete** |

### Transcript Section States

| Status | Display |
|--------|---------|
| `pending` | "Transcribing…" with spinner |
| `queued` | "Waiting for network…" |
| `processing` | "Transcribing…" with spinner |
| `done` | Transcript text; Export button enabled |
| `failed` | "Transcription failed. [error_code]" in red; Export disabled |

### Interaction States

| State | UI |
|-------|----|
| Loading recording | Skeleton for scrub bar + transcript |
| Rename | Title becomes inline text input; keyboard shown; confirm on return |
| Delete | Alert: "Delete recording? This cannot be undone." → navigate back |
| Live transcript arrival | Transcript section updates without reload |

### Navigation

- Back → FolderScreen (`/folder/[id]`)
- Delete → navigate back to FolderScreen
