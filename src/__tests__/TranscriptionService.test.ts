/**
 * TranscriptionService tests.
 * expo-file-system, expo-constants, netinfo, and global fetch are all mocked.
 */

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('expo-file-system', () => ({
  readAsStringAsync: jest.fn().mockResolvedValue('BASE64AUDIO=='),
  EncodingType: { Base64: 'base64' },
}));

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: {
      extra: { geminiApiKey: 'test-api-key' },
    },
  },
}));

jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: {
    fetch: jest.fn().mockResolvedValue({ isConnected: true }),
  },
}));

// ── Imports ───────────────────────────────────────────────────────────────────

import * as FileSystem from 'expo-file-system';
import NetInfo from '@react-native-community/netinfo';
import * as TranscriptionService from '@/services/TranscriptionService';
import { TranscriptionError } from '@/services/TranscriptionService';

const mockFetch = jest.fn();
global.fetch = mockFetch;

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeGeminiResponse(text: string): Response {
  return {
    ok: true,
    status: 200,
    json: jest.fn().mockResolvedValue({
      candidates: [{ content: { parts: [{ text }] } }],
    }),
    text: jest.fn().mockResolvedValue(''),
  } as unknown as Response;
}

function makeErrorResponse(status: number, body = 'error'): Response {
  return {
    ok: false,
    status,
    json: jest.fn().mockRejectedValue(new Error('not json')),
    text: jest.fn().mockResolvedValue(body),
  } as unknown as Response;
}

// ── isOnline ──────────────────────────────────────────────────────────────────

describe('isOnline', () => {
  it('returns true when connected', async () => {
    (NetInfo.fetch as jest.Mock).mockResolvedValueOnce({ isConnected: true });
    expect(await TranscriptionService.isOnline()).toBe(true);
  });

  it('returns false when disconnected', async () => {
    (NetInfo.fetch as jest.Mock).mockResolvedValueOnce({ isConnected: false });
    expect(await TranscriptionService.isOnline()).toBe(false);
  });
});

// ── transcribe — happy path ───────────────────────────────────────────────────

describe('transcribe — success', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns transcript text from Gemini response', async () => {
    mockFetch.mockResolvedValueOnce(makeGeminiResponse('Hello world'));
    const result = await TranscriptionService.transcribe('file:///tmp/rec.m4a');
    expect(result.text).toBe('Hello world');
  });

  it('POSTs to the correct Gemini endpoint with the API key', async () => {
    mockFetch.mockResolvedValueOnce(makeGeminiResponse('ok'));
    await TranscriptionService.transcribe('file:///tmp/rec.m4a');

    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('gemini-1.5-flash');
    expect(url).toContain('test-api-key');
    expect(options.method).toBe('POST');
  });

  it('sends base64-encoded audio in the request body', async () => {
    mockFetch.mockResolvedValueOnce(makeGeminiResponse('ok'));
    await TranscriptionService.transcribe('file:///tmp/rec.m4a');

    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(options.body as string);
    const parts = body.contents[0].parts;
    expect(parts[1].inline_data.data).toBe('BASE64AUDIO==');
    expect(parts[1].inline_data.mime_type).toBe('audio/mp4');
  });
});

// ── transcribe — error codes ──────────────────────────────────────────────────

describe('transcribe — error mapping', () => {
  beforeEach(() => jest.clearAllMocks());

  it('throws FILE_ERROR when file read fails', async () => {
    (FileSystem.readAsStringAsync as jest.Mock).mockRejectedValueOnce(
      new Error('file not found'),
    );
    await expect(
      TranscriptionService.transcribe('file:///missing.m4a'),
    ).rejects.toMatchObject({ error_code: 'FILE_ERROR' });
  });

  it('throws NETWORK_ERROR when fetch throws', async () => {
    mockFetch.mockRejectedValueOnce(new Error('network down'));
    await expect(
      TranscriptionService.transcribe('file:///tmp/rec.m4a'),
    ).rejects.toMatchObject({ error_code: 'NETWORK_ERROR' });
  });

  it('throws API_LIMIT on HTTP 429', async () => {
    mockFetch.mockResolvedValueOnce(makeErrorResponse(429));
    await expect(
      TranscriptionService.transcribe('file:///tmp/rec.m4a'),
    ).rejects.toMatchObject({ error_code: 'API_LIMIT' });
  });

  it('throws API_ERROR on HTTP 500', async () => {
    mockFetch.mockResolvedValueOnce(makeErrorResponse(500));
    await expect(
      TranscriptionService.transcribe('file:///tmp/rec.m4a'),
    ).rejects.toMatchObject({ error_code: 'API_ERROR' });
  });

  it('throws API_ERROR when response has no transcript text', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({ candidates: [] }),
      text: jest.fn().mockResolvedValue(''),
    } as unknown as Response);
    await expect(
      TranscriptionService.transcribe('file:///tmp/rec.m4a'),
    ).rejects.toMatchObject({ error_code: 'API_ERROR' });
  });

  it('TranscriptionError is an instance of Error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('oops'));
    try {
      await TranscriptionService.transcribe('file:///tmp/rec.m4a');
    } catch (err) {
      expect(err).toBeInstanceOf(TranscriptionError);
      expect(err).toBeInstanceOf(Error);
    }
  });
});
