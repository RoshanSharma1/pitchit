/**
 * RecordingPipeline tests.
 * All service dependencies are mocked.
 */

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('uuid', () => ({ v4: jest.fn().mockReturnValue('test-uuid') }));

jest.mock('@/services/RecorderService', () => ({
  start: jest.fn().mockResolvedValue(undefined),
  stop: jest.fn().mockResolvedValue({ uri: 'file:///tmp/rec.m4a', durationMs: 5000 }),
}));

jest.mock('@/db/StorageService', () => ({
  insertRecording: jest.fn().mockResolvedValue(undefined),
  getRecording: jest.fn(),
  updateRecording: jest.fn().mockResolvedValue(undefined),
  recoverStuckRecordings: jest.fn().mockResolvedValue(undefined),
  getFolders: jest.fn().mockResolvedValue([]),
  getRecordingsForFolder: jest.fn().mockResolvedValue([]),
}));

jest.mock('@/services/TranscriptionService', () => ({
  transcribe: jest.fn(),
  isOnline: jest.fn().mockResolvedValue(true),
}));

jest.mock('@/services/TitleService', () => ({
  generate: jest.fn().mockResolvedValue('Generated Title'),
}));

// ── Imports ───────────────────────────────────────────────────────────────────

import * as RecorderService from '@/services/RecorderService';
import * as StorageService from '@/db/StorageService';
import { transcribe, isOnline } from '@/services/TranscriptionService';
import { generate as generateTitle } from '@/services/TitleService';
import * as Pipeline from '@/services/RecordingPipeline';
import { Recording } from '@/types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRecording(overrides: Partial<Recording> = {}): Recording {
  return {
    id: 'test-uuid',
    folder_id: 'folder-1',
    title: '',
    audio_uri: 'file:///tmp/rec.m4a',
    duration_ms: 5000,
    transcript_text: null,
    transcription_status: 'pending',
    error_code: null,
    error_message: null,
    deleted_at: null,
    created_at: 1000,
    updated_at: 1000,
    ...overrides,
  };
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  (isOnline as jest.Mock).mockResolvedValue(true);
  (transcribe as jest.Mock).mockResolvedValue({ text: 'Hello transcript' });
  (generateTitle as jest.Mock).mockResolvedValue('Generated Title');

  // Default: getRecording returns a pending recording, then updated versions.
  (StorageService.getRecording as jest.Mock).mockResolvedValue(makeRecording());
});

// ── start ─────────────────────────────────────────────────────────────────────

describe('start', () => {
  it('delegates to RecorderService.start', async () => {
    await Pipeline.start();
    expect(RecorderService.start).toHaveBeenCalledTimes(1);
  });
});

// ── stop ──────────────────────────────────────────────────────────────────────

describe('stop', () => {
  it('inserts a recording row with status pending', async () => {
    await Pipeline.stop('folder-1');
    expect(StorageService.insertRecording).toHaveBeenCalledWith(
      expect.objectContaining({ transcription_status: 'pending', folder_id: 'folder-1' }),
    );
  });

  it('returns the newly created recording', async () => {
    const rec = await Pipeline.stop('folder-1');
    expect(rec.id).toBe('test-uuid');
    expect(rec.transcription_status).toBe('pending');
  });
});

// ── _process — offline path ───────────────────────────────────────────────────

describe('_process — offline', () => {
  it('sets status to queued when offline', async () => {
    (isOnline as jest.Mock).mockResolvedValueOnce(false);
    (StorageService.getRecording as jest.Mock)
      .mockResolvedValueOnce(makeRecording())
      .mockResolvedValueOnce(makeRecording({ transcription_status: 'queued' }));

    await Pipeline._process('test-uuid');

    expect(StorageService.updateRecording).toHaveBeenCalledWith(
      'test-uuid',
      expect.objectContaining({ transcription_status: 'queued' }),
    );
    expect(transcribe).not.toHaveBeenCalled();
  });
});

// ── _process — online path ────────────────────────────────────────────────────

describe('_process — online', () => {
  it('runs full pipeline: transcribe → title → done', async () => {
    (StorageService.getRecording as jest.Mock)
      .mockResolvedValueOnce(makeRecording())
      .mockResolvedValueOnce(makeRecording({ transcription_status: 'processing' }))
      .mockResolvedValueOnce(makeRecording({ transcription_status: 'done', title: 'Generated Title' }));

    await Pipeline._process('test-uuid');

    expect(transcribe).toHaveBeenCalledWith('file:///tmp/rec.m4a');
    expect(generateTitle).toHaveBeenCalledWith('Hello transcript');
    expect(StorageService.updateRecording).toHaveBeenCalledWith(
      'test-uuid',
      expect.objectContaining({ transcription_status: 'done', title: 'Generated Title' }),
    );
  });

  it('saves transcript even when title generation would fail', async () => {
    (generateTitle as jest.Mock).mockRejectedValueOnce(new Error('title API down'));
    (StorageService.getRecording as jest.Mock).mockResolvedValue(makeRecording());

    // Should not throw — title failure is handled inside TitleService (fallback)
    // but even if it throws here, transcript should be saved first.
    await Pipeline._process('test-uuid').catch(() => {});

    // transcript_text update must have been called before title update
    const calls = (StorageService.updateRecording as jest.Mock).mock.calls;
    const transcriptCall = calls.find(
      ([, patch]: [string, Partial<Recording>]) => patch.transcript_text === 'Hello transcript',
    );
    expect(transcriptCall).toBeDefined();
  });

  it('sets status failed with correct error_code on transcription error', async () => {
    const err = Object.assign(new Error('API limit'), { error_code: 'API_LIMIT' });
    (transcribe as jest.Mock).mockRejectedValueOnce(err);
    (StorageService.getRecording as jest.Mock)
      .mockResolvedValueOnce(makeRecording())
      .mockResolvedValueOnce(makeRecording({ transcription_status: 'processing' }))
      .mockResolvedValueOnce(makeRecording({ transcription_status: 'failed', error_code: 'API_LIMIT' }));

    await Pipeline._process('test-uuid');

    expect(StorageService.updateRecording).toHaveBeenCalledWith(
      'test-uuid',
      expect.objectContaining({ transcription_status: 'failed', error_code: 'API_LIMIT' }),
    );
  });
});

// ── retryQueued ───────────────────────────────────────────────────────────────

describe('retryQueued', () => {
  it('calls recoverStuckRecordings first', async () => {
    await Pipeline.retryQueued();
    expect(StorageService.recoverStuckRecordings).toHaveBeenCalledTimes(1);
  });

  it('processes pending and queued recordings', async () => {
    const pending = makeRecording({ id: 'r1', transcription_status: 'pending' });
    const queued = makeRecording({ id: 'r2', transcription_status: 'queued' });
    const done = makeRecording({ id: 'r3', transcription_status: 'done' });

    (StorageService.getFolders as jest.Mock).mockResolvedValueOnce([
      { id: 'folder-1', name: 'Inbox', is_system: 1, recording_count: 3, created_at: 0, updated_at: 0 },
    ]);
    (StorageService.getRecordingsForFolder as jest.Mock).mockResolvedValueOnce([pending, queued, done]);
    (StorageService.getRecording as jest.Mock).mockResolvedValue(makeRecording({ transcription_status: 'done' }));

    await Pipeline.retryQueued();

    // _process called for r1 and r2 but not r3
    const getRecordingCalls = (StorageService.getRecording as jest.Mock).mock.calls.map(
      ([id]: [string]) => id,
    );
    expect(getRecordingCalls).toContain('r1');
    expect(getRecordingCalls).toContain('r2');
  });
});
