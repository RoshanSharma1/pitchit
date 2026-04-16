/**
 * RecordingPipeline — orchestrates the record → persist → transcribe → title lifecycle.
 *
 * Responsibilities:
 *   - start()         delegates to RecorderService
 *   - stop(folderId)  stops recorder, inserts row (status pending), kicks off _process()
 *   - _process(id)    online: transcribe → title → done; offline: queued
 *   - retryQueued()   processes all pending/queued rows (called on connectivity restore)
 *   - onRecordingUpdate(cb)  event emitter for UI status changes
 */

import * as Crypto from 'expo-crypto';
import * as RecorderService from './RecorderService';
import * as StorageService from '@/db/StorageService';
import { transcribe, isOnline } from './TranscriptionService';
import { generate as generateTitle } from './TitleService';
import { Recording } from '@/types';

type UpdateCallback = (recording: Recording) => void;

const _listeners: Set<UpdateCallback> = new Set();

function _emit(recording: Recording): void {
  _listeners.forEach((cb) => cb(recording));
}

/** Register a callback to receive recording status updates. */
export function onRecordingUpdate(cb: UpdateCallback): () => void {
  _listeners.add(cb);
  return () => _listeners.delete(cb);
}

/** Start recording — delegates to RecorderService. */
export async function start(): Promise<void> {
  await RecorderService.start();
}

/**
 * Stop recording, persist the row, and kick off async processing.
 *
 * @param folderId - Folder to save the recording into
 * @returns The newly created Recording (status: pending or queued)
 */
export async function stop(folderId: string): Promise<Recording> {
  const { uri, durationMs } = await RecorderService.stop();

  const now = Date.now();
  const recording: Recording = {
    id: Crypto.randomUUID(),
    folder_id: folderId,
    title: '',
    audio_uri: uri,
    duration_ms: durationMs,
    transcript_text: null,
    transcription_status: 'pending',
    error_code: null,
    error_message: null,
    deleted_at: null,
    created_at: now,
    updated_at: now,
  };

  await StorageService.insertRecording(recording);
  _emit(recording);

  // Fire-and-forget — UI reacts via onRecordingUpdate callbacks.
  _process(recording.id).catch(() => {/* errors are persisted on the row */});

  return recording;
}

/**
 * Process a single recording: transcribe and generate title if online,
 * otherwise mark as queued.
 */
export async function _process(id: string): Promise<void> {
  const recording = await StorageService.getRecording(id);
  if (!recording) return;

  const online = await isOnline();
  if (!online) {
    await StorageService.updateRecording(id, {
      transcription_status: 'queued',
      updated_at: Date.now(),
    });
    const updated = await StorageService.getRecording(id);
    if (updated) _emit(updated);
    return;
  }

  // Mark as processing.
  await StorageService.updateRecording(id, {
    transcription_status: 'processing',
    updated_at: Date.now(),
  });
  const processing = await StorageService.getRecording(id);
  if (processing) _emit(processing);

  // Transcribe.
  let transcriptText: string;
  try {
    const result = await transcribe(recording.audio_uri);
    transcriptText = result.text;
  } catch (err: unknown) {
    const error = err as { error_code?: string; message?: string };
    await StorageService.updateRecording(id, {
      transcription_status: 'failed',
      error_code: (error.error_code as Recording['error_code']) ?? 'API_ERROR',
      error_message: error.message ?? 'Unknown error',
      updated_at: Date.now(),
    });
    const failed = await StorageService.getRecording(id);
    if (failed) _emit(failed);
    return;
  }

  // Save transcript immediately — title failure must not lose the transcript.
  await StorageService.updateRecording(id, {
    transcript_text: transcriptText,
    updated_at: Date.now(),
  });

  // Generate title (best-effort — falls back internally).
  const title = await generateTitle(transcriptText);

  await StorageService.updateRecording(id, {
    title,
    transcription_status: 'done',
    updated_at: Date.now(),
  });

  const done = await StorageService.getRecording(id);
  if (done) _emit(done);
}

/**
 * Retry all pending and queued recordings.
 * Called on app launch (after recoverStuckRecordings) and on connectivity restore.
 */
export async function retryQueued(): Promise<void> {
  // Recover any rows stuck in 'processing' from a previous crash.
  await StorageService.recoverStuckRecordings();

  // Collect all folders and find pending/queued recordings.
  const folders = await StorageService.getFolders();
  const toProcess: string[] = [];

  for (const folder of folders) {
    const recordings = await StorageService.getRecordingsForFolder(folder.id);
    for (const r of recordings) {
      if (r.transcription_status === 'pending' || r.transcription_status === 'queued') {
        toProcess.push(r.id);
      }
    }
  }

  // Process sequentially to avoid hammering the API.
  for (const id of toProcess) {
    await _process(id).catch(() => {/* errors persisted on row */});
  }
}
