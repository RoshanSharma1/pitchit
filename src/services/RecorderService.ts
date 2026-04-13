/**
 * RecorderService — thin wrapper over expo-av for recording voice memos.
 *
 * Behaviour:
 *   - Records AAC 128 kbps mono .m4a
 *   - Emits duration ticks every second via onDurationTick
 *   - Fires onWarning at the 9-minute mark
 *   - Auto-stops at MAX_RECORDING_DURATION_MS (10 minutes)
 */

import { Audio } from 'expo-av';
import { MAX_RECORDING_DURATION_MS } from '@/constants';

const WARNING_MS = 9 * 60 * 1000; // 9 minutes
const TICK_INTERVAL_MS = 1000;

type DurationCallback = (elapsedMs: number) => void;
type WarningCallback = () => void;

let recording: Audio.Recording | null = null;
let tickTimer: ReturnType<typeof setInterval> | null = null;
let warningTimer: ReturnType<typeof setTimeout> | null = null;
let autoStopTimer: ReturnType<typeof setTimeout> | null = null;
let startTime = 0;

let _onDurationTick: DurationCallback | null = null;
let _onWarning: WarningCallback | null = null;

/** Request microphone permission. Returns true if granted. */
export async function requestPermission(): Promise<boolean> {
  const { granted } = await Audio.requestPermissionsAsync();
  return granted;
}

/**
 * Start recording. Configures audio mode, creates the Recording instance,
 * starts it, and arms all timers.
 */
export async function start(): Promise<void> {
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: true,
    playsInSilentModeIOS: true,
  });

  recording = new Audio.Recording();
  await recording.prepareToRecordAsync({
    android: {
      extension: '.m4a',
      outputFormat: Audio.AndroidOutputFormat.MPEG_4,
      audioEncoder: Audio.AndroidAudioEncoder.AAC,
      sampleRate: 44100,
      numberOfChannels: 1,
      bitRate: 128000,
    },
    ios: {
      extension: '.m4a',
      outputFormat: Audio.IOSOutputFormat.MPEG4AAC,
      audioQuality: Audio.IOSAudioQuality.HIGH,
      sampleRate: 44100,
      numberOfChannels: 1,
      bitRate: 128000,
      linearPCMBitDepth: 16,
      linearPCMIsBigEndian: false,
      linearPCMIsFloat: false,
    },
    web: { mimeType: 'audio/mp4', bitsPerSecond: 128000 },
  });

  await recording.startAsync();
  startTime = Date.now();

  // Per-second duration ticks.
  tickTimer = setInterval(() => {
    _onDurationTick?.(Date.now() - startTime);
  }, TICK_INTERVAL_MS);

  // 9-minute warning.
  warningTimer = setTimeout(() => {
    _onWarning?.();
  }, WARNING_MS);

  // 10-minute auto-stop.
  autoStopTimer = setTimeout(async () => {
    await stop();
  }, MAX_RECORDING_DURATION_MS);
}

/**
 * Stop the recording and clear all timers.
 * @returns uri and durationMs of the completed recording.
 */
export async function stop(): Promise<{ uri: string; durationMs: number }> {
  _clearTimers();

  if (!recording) throw new Error('No active recording.');

  await recording.stopAndUnloadAsync();
  const status = await recording.getStatusAsync();
  const uri = recording.getURI() ?? '';
  const durationMs = status.isLoaded ? (status.durationMillis ?? 0) : Date.now() - startTime;

  recording = null;
  return { uri, durationMs };
}

/** Register a callback that fires every second with elapsed milliseconds. */
export function onDurationTick(cb: DurationCallback): void {
  _onDurationTick = cb;
}

/** Register a callback that fires at the 9-minute warning mark. */
export function onWarning(cb: WarningCallback): void {
  _onWarning = cb;
}

// ── Private helpers ───────────────────────────────────────────────────────────

function _clearTimers(): void {
  if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
  if (warningTimer) { clearTimeout(warningTimer); warningTimer = null; }
  if (autoStopTimer) { clearTimeout(autoStopTimer); autoStopTimer = null; }
}
