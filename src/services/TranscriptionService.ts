/**
 * TranscriptionService — sends audio to Gemini 1.5 Flash for transcription.
 *
 * Behaviour:
 *   - isOnline() checks network reachability via NetInfo
 *   - transcribe(audioUri) reads the file, base64-encodes it, and POSTs to
 *     the Gemini generateContent endpoint
 *   - Typed errors are thrown with an `error_code` property for the pipeline
 *     to record on the Recording row
 */

import NetInfo from '@react-native-community/netinfo';
import * as FileSystem from 'expo-file-system';
import Constants from 'expo-constants';
import { Recording } from '@/types';

// ── Typed error ───────────────────────────────────────────────────────────────

export type TranscriptionErrorCode = Recording['error_code'];

export class TranscriptionError extends Error {
  constructor(
    public readonly error_code: NonNullable<TranscriptionErrorCode>,
    message: string,
  ) {
    super(message);
    this.name = 'TranscriptionError';
  }
}

// ── Gemini constants ──────────────────────────────────────────────────────────

const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_BASE_URL =
  'https://generativelanguage.googleapis.com/v1beta/models';

const TRANSCRIPTION_PROMPT =
  'Transcribe the following audio recording verbatim. ' +
  'Return only the transcript text with no additional commentary.';

// ── Public API ────────────────────────────────────────────────────────────────

/** Returns true if the device currently has network connectivity. */
export async function isOnline(): Promise<boolean> {
  const state = await NetInfo.fetch();
  return state.isConnected === true;
}

/**
 * Transcribe an audio file via Gemini 1.5 Flash.
 *
 * @param audioUri - Local file URI produced by expo-av (e.g. file:///tmp/rec.m4a)
 * @returns `{ text: string }` on success
 * @throws `TranscriptionError` with a typed `error_code` on failure
 */
export async function transcribe(audioUri: string): Promise<{ text: string }> {
  const apiKey = _getApiKey();

  // Read and base64-encode the audio file.
  let base64Audio: string;
  try {
    base64Audio = await FileSystem.readAsStringAsync(audioUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
  } catch (err) {
    throw new TranscriptionError('FILE_ERROR', `Failed to read audio file: ${String(err)}`);
  }

  const url = `${GEMINI_BASE_URL}/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
  const body = {
    contents: [
      {
        parts: [
          { text: TRANSCRIPTION_PROMPT },
          {
            inline_data: {
              mime_type: 'audio/mp4',
              data: base64Audio,
            },
          },
        ],
      },
    ],
  };

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new TranscriptionError('NETWORK_ERROR', `Network request failed: ${String(err)}`);
  }

  if (!response.ok) {
    const errorCode = response.status === 429 ? 'API_LIMIT' : 'API_ERROR';
    const detail = await response.text().catch(() => String(response.status));
    console.error(`[TranscriptionService] HTTP ${response.status}:`, detail);
    throw new TranscriptionError(errorCode, `Gemini API error ${response.status}: ${detail}`);
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new TranscriptionError('API_ERROR', 'Failed to parse Gemini response JSON');
  }

  const text = _extractText(data);
  if (text === null) {
    console.error('[TranscriptionService] Unexpected response shape:', JSON.stringify(data).slice(0, 300));
    throw new TranscriptionError('API_ERROR', 'No transcript text in Gemini response');
  }

  return { text };
}

// ── Private helpers ───────────────────────────────────────────────────────────

function _getApiKey(): string {
  const key = Constants.expoConfig?.extra?.geminiApiKey as string | undefined;
  if (!key) {
    console.error('[TranscriptionService] GEMINI_API_KEY is not configured. expoConfig.extra:', Constants.expoConfig?.extra);
    throw new TranscriptionError('API_ERROR', 'GEMINI_API_KEY is not configured');
  }
  return key;
}

function _extractText(data: unknown): string | null {
  try {
    const d = data as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
      }>;
    };
    return d.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
  } catch {
    return null;
  }
}
