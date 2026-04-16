/**
 * Transcription processing status for a recording.
 * - pending: newly inserted, not yet processed
 * - queued: offline at record time; awaiting connectivity to process
 * - processing: transcription/title generation in-flight
 * - done: transcript and title are available
 * - failed: unrecoverable error; error_code and error_message set
 */
export type TranscriptionStatus = 'pending' | 'queued' | 'processing' | 'done' | 'failed';

/** A user-created folder that groups recordings. */
export interface Folder {
  id: string;
  name: string;
  /** 1 if this is a system-managed folder (e.g. Inbox); cannot be deleted. */
  is_system: 0 | 1;
  recording_count: number;
  created_at: number;
  updated_at: number;
}

/** A voice recording and its associated transcription metadata. */
export interface Recording {
  id: string;
  folder_id: string;
  title: string;
  audio_uri: string;
  duration_ms: number;
  transcript_text: string | null;
  transcription_status: TranscriptionStatus;
  /** Typed error code set when transcription_status === 'failed'. */
  error_code: 'NETWORK_ERROR' | 'API_LIMIT' | 'API_ERROR' | 'FILE_ERROR' | null;
  error_message: string | null;
  /** Unix timestamp (ms) set when the recording is soft-deleted. */
  deleted_at: number | null;
  created_at: number;
  updated_at: number;
}
