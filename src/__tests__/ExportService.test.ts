/**
 * ExportService tests.
 * expo-file-system and expo-sharing are mocked.
 */

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('expo-file-system', () => ({
  writeAsStringAsync: jest.fn().mockResolvedValue(undefined),
  cacheDirectory: 'file:///cache/',
  EncodingType: { UTF8: 'utf8' },
}));

jest.mock('expo-sharing', () => ({
  shareAsync: jest.fn().mockResolvedValue(undefined),
}));

// ── Imports ───────────────────────────────────────────────────────────────────

import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { exportRecording } from '@/services/ExportService';
import { Recording } from '@/types';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const sampleRecording: Recording = {
  id: 'rec-123',
  folder_id: 'folder-abc',
  title: 'My Test Recording',
  audio_uri: 'file:///tmp/rec.m4a',
  duration_ms: 75000,
  transcript_text: 'This is the transcript text.',
  transcription_status: 'done',
  error_code: null,
  error_message: null,
  deleted_at: null,
  created_at: new Date('2024-03-15T10:30:00.000Z').getTime(),
  updated_at: new Date('2024-03-15T10:30:00.000Z').getTime(),
};

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => jest.clearAllMocks());

describe('exportRecording', () => {
  it('writes Markdown file to CacheDirectory with correct path', async () => {
    await exportRecording(sampleRecording, 'Inbox');
    expect(FileSystem.writeAsStringAsync).toHaveBeenCalledWith(
      'file:///cache/rec-123.md',
      expect.any(String),
      { encoding: 'utf8' },
    );
  });

  it('calls shareAsync with the correct file path', async () => {
    await exportRecording(sampleRecording, 'Inbox');
    expect(Sharing.shareAsync).toHaveBeenCalledWith('file:///cache/rec-123.md');
  });

  it('Markdown output contains YAML front-matter fields', async () => {
    await exportRecording(sampleRecording, 'My Folder');
    const written = (FileSystem.writeAsStringAsync as jest.Mock).mock.calls[0][1] as string;

    expect(written).toContain('title: "My Test Recording"');
    expect(written).toContain('folder: "My Folder"');
    expect(written).toContain('duration: 75s');
    expect(written).toContain('date: 2024-03-15T10:30:00.000Z');
  });

  it('Markdown output contains transcript text', async () => {
    await exportRecording(sampleRecording, 'Inbox');
    const written = (FileSystem.writeAsStringAsync as jest.Mock).mock.calls[0][1] as string;
    expect(written).toContain('This is the transcript text.');
  });

  it('handles null transcript_text gracefully', async () => {
    const rec = { ...sampleRecording, transcript_text: null };
    await expect(exportRecording(rec, 'Inbox')).resolves.toBeUndefined();
    const written = (FileSystem.writeAsStringAsync as jest.Mock).mock.calls[0][1] as string;
    expect(written).toContain('---\n\n');
  });
});
