/**
 * TitleService tests.
 * fetch, expo-constants, and TranscriptionService.isOnline are mocked.
 */

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: {
      extra: { geminiApiKey: 'test-api-key' },
    },
  },
}));

jest.mock('@/services/TranscriptionService', () => ({
  isOnline: jest.fn().mockResolvedValue(true),
}));

// ── Imports ───────────────────────────────────────────────────────────────────

import { isOnline } from '@/services/TranscriptionService';
import * as TitleService from '@/services/TitleService';

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
  } as unknown as Response;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  (isOnline as jest.Mock).mockResolvedValue(true);
});

describe('generate — online success', () => {
  it('returns title from Gemini response', async () => {
    mockFetch.mockResolvedValueOnce(makeGeminiResponse('My Great Recording'));
    const title = await TitleService.generate('Hello world transcript');
    expect(title).toBe('My Great Recording');
  });

  it('truncates title to 60 characters', async () => {
    const longTitle = 'A'.repeat(80);
    mockFetch.mockResolvedValueOnce(makeGeminiResponse(longTitle));
    const title = await TitleService.generate('some transcript');
    expect(title.length).toBeLessThanOrEqual(60);
    expect(title).toBe('A'.repeat(60));
  });
});

describe('generate — fallback cases', () => {
  it('returns timestamp fallback when offline', async () => {
    (isOnline as jest.Mock).mockResolvedValueOnce(false);
    const title = await TitleService.generate('some transcript');
    expect(title).toMatch(/^Recording – /);
  });

  it('returns timestamp fallback when API returns non-ok response', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 } as Response);
    const title = await TitleService.generate('some transcript');
    expect(title).toMatch(/^Recording – /);
  });

  it('returns timestamp fallback when fetch throws', async () => {
    mockFetch.mockRejectedValueOnce(new Error('network error'));
    const title = await TitleService.generate('some transcript');
    expect(title).toMatch(/^Recording – /);
  });
});
