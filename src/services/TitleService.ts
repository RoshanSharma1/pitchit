/**
 * TitleService — generates a short title for a recording transcript.
 *
 * Behaviour:
 *   - If online: calls Gemini to produce a title, truncated to 60 chars
 *   - If offline or API fails: returns "Recording – {MMM D, YYYY h:mm A}"
 */

import Constants from 'expo-constants';
import { isOnline } from './TranscriptionService';

const GEMINI_MODEL = 'gemini-2.0-flash';
const GEMINI_BASE_URL =
  'https://generativelanguage.googleapis.com/v1beta/models';
const MAX_TITLE_LENGTH = 60;

function _fallbackTitle(date: Date = new Date()): string {
  return `Recording – ${date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })}`;
}

/**
 * Generate a short title for the given transcript.
 *
 * @param transcript - The transcribed text
 * @returns A title string (≤60 chars), or a timestamp fallback
 */
export async function generate(transcript: string): Promise<string> {
  const online = await isOnline();
  if (!online) return _fallbackTitle();

  try {
    const apiKey = Constants.expoConfig?.extra?.geminiApiKey as string | undefined;
    if (!apiKey) return _fallbackTitle();

    const url = `${GEMINI_BASE_URL}/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
    const body = {
      contents: [
        {
          parts: [
            {
              text:
                `Generate a concise title (maximum ${MAX_TITLE_LENGTH} characters) for this recording transcript. ` +
                `Return only the title text with no quotes or punctuation at the end.\n\nTranscript:\n${transcript}`,
            },
          ],
        },
      ],
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) return _fallbackTitle();

    const data = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };

    const title = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!title) return _fallbackTitle();

    return title.slice(0, MAX_TITLE_LENGTH);
  } catch {
    return _fallbackTitle();
  }
}
