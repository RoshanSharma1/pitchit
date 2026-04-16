/**
 * RecorderService tests — expo-av is fully mocked.
 * Jest fake timers drive setTimeout/setInterval calls.
 */

// ── Mock expo-av ──────────────────────────────────────────────────────────────

jest.mock('expo-av', () => ({
  Audio: {
    Recording: jest.fn().mockImplementation(() => ({
      prepareToRecordAsync: jest.fn().mockResolvedValue(undefined),
      startAsync: jest.fn().mockResolvedValue(undefined),
      stopAndUnloadAsync: jest.fn().mockResolvedValue(undefined),
      getStatusAsync: jest.fn().mockResolvedValue({ isLoaded: true, durationMillis: 12000 }),
      getURI: jest.fn().mockReturnValue('file:///tmp/rec.m4a'),
    })),
    requestPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
    setAudioModeAsync: jest.fn().mockResolvedValue(undefined),
    AndroidOutputFormat: { MPEG_4: 'mpeg4' },
    AndroidAudioEncoder: { AAC: 'aac' },
    IOSOutputFormat: { MPEG4AAC: 'mpeg4aac' },
    IOSAudioQuality: { HIGH: 'high' },
  },
}));

// ── Tests ─────────────────────────────────────────────────────────────────────

import { Audio } from 'expo-av';
import * as RecorderService from '@/services/RecorderService';

// Typed helpers to access mock fns.
const mockAudio = Audio as jest.Mocked<typeof Audio>;

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  (mockAudio.requestPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true });
  (mockAudio.setAudioModeAsync as jest.Mock).mockResolvedValue(undefined);
  // Reset Recording mock to return fresh instance mocks each time.
  (mockAudio.Recording as unknown as jest.Mock).mockImplementation(() => ({
    prepareToRecordAsync: jest.fn().mockResolvedValue(undefined),
    startAsync: jest.fn().mockResolvedValue(undefined),
    stopAndUnloadAsync: jest.fn().mockResolvedValue(undefined),
    getStatusAsync: jest.fn().mockResolvedValue({ isLoaded: true, durationMillis: 12000 }),
    getURI: jest.fn().mockReturnValue('file:///tmp/rec.m4a'),
  }));
});

afterEach(() => {
  jest.useRealTimers();
});

// ── requestPermission ─────────────────────────────────────────────────────────

describe('requestPermission', () => {
  it('returns true when permission is granted', async () => {
    const result = await RecorderService.requestPermission();
    expect(result).toBe(true);
  });

  it('returns false when permission is denied', async () => {
    (mockAudio.requestPermissionsAsync as jest.Mock).mockResolvedValueOnce({ granted: false });
    const result = await RecorderService.requestPermission();
    expect(result).toBe(false);
  });
});

// ── start / stop ──────────────────────────────────────────────────────────────

describe('start and stop', () => {
  it('calls setAudioModeAsync and startAsync on start()', async () => {
    await RecorderService.start();
    expect(mockAudio.setAudioModeAsync).toHaveBeenCalledTimes(1);
    // Clean up
    await RecorderService.stop();
  });

  it('stop() returns uri and durationMs', async () => {
    await RecorderService.start();
    const result = await RecorderService.stop();
    expect(result.uri).toBe('file:///tmp/rec.m4a');
    expect(result.durationMs).toBe(12000);
  });
});

// ── onDurationTick ────────────────────────────────────────────────────────────

describe('onDurationTick', () => {
  it('fires approximately every second', async () => {
    const ticks: number[] = [];
    RecorderService.onDurationTick((ms) => ticks.push(ms));
    await RecorderService.start();

    jest.advanceTimersByTime(3000);
    expect(ticks).toHaveLength(3);

    await RecorderService.stop();
  });
});

// ── onWarning ─────────────────────────────────────────────────────────────────

describe('onWarning', () => {
  it('fires at the 9-minute mark', async () => {
    const warnCb = jest.fn();
    RecorderService.onWarning(warnCb);
    await RecorderService.start();

    jest.advanceTimersByTime(9 * 60 * 1000);
    expect(warnCb).toHaveBeenCalledTimes(1);

    await RecorderService.stop();
  });

  it('does not fire before 9 minutes', async () => {
    const warnCb = jest.fn();
    RecorderService.onWarning(warnCb);
    await RecorderService.start();

    jest.advanceTimersByTime(8 * 60 * 1000);
    expect(warnCb).not.toHaveBeenCalled();

    await RecorderService.stop();
  });
});

// ── 10-minute auto-stop ───────────────────────────────────────────────────────

describe('10-minute auto-stop', () => {
  it('calls stopAndUnloadAsync at 10 minutes', async () => {
    await RecorderService.start();
    jest.advanceTimersByTime(10 * 60 * 1000);
    // Allow async callbacks triggered by fake timers to flush.
    await Promise.resolve();
    // Grab the Recording instance that was created during start().
    const instance = (mockAudio.Recording as unknown as jest.Mock).mock.results[0].value;
    expect(instance.stopAndUnloadAsync).toHaveBeenCalled();
  });
});
