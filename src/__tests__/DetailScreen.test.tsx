/**
 * DetailScreen tests (TASK-014).
 * Verifies: playback controls present; export disabled when pending;
 * rename updates title; delete navigates back.
 */

import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import type { Recording } from '@/types';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack }),
  useLocalSearchParams: () => ({ id: 'r1' }),
}));

const mockGetRecording = jest.fn<Promise<Recording | null>, [string]>();
const mockUpdateRecording = jest.fn<Promise<void>, [string, Partial<Recording>]>();
const mockSoftDelete = jest.fn<Promise<void>, [string]>();

jest.mock('@/db/StorageService', () => ({
  getRecording: (id: string) => mockGetRecording(id),
  updateRecording: (id: string, patch: Partial<Recording>) => mockUpdateRecording(id, patch),
  softDeleteRecording: (id: string) => mockSoftDelete(id),
}));

jest.mock('@/services/RecordingPipeline', () => ({
  onRecordingUpdate: () => () => {},
}));

jest.mock('@/services/ExportService', () => ({
  exportRecording: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('expo-av', () => ({
  Audio: {
    Sound: {
      createAsync: jest.fn().mockResolvedValue({
        sound: {
          setOnPlaybackStatusUpdate: jest.fn(),
          playAsync: jest.fn(),
          pauseAsync: jest.fn(),
          setRateAsync: jest.fn(),
          setPositionAsync: jest.fn(),
          unloadAsync: jest.fn(),
        },
      }),
    },
  },
}));

import DetailScreen from '../../../app/recording/[id]';
import { exportRecording } from '@/services/ExportService';

// ── Helpers ───────────────────────────────────────────────────────────────────

const makeRecording = (overrides: Partial<Recording> = {}): Recording => ({
  id: 'r1',
  folder_id: 'inbox',
  title: 'Guitar riff',
  audio_uri: 'file://audio/r1.m4a',
  duration_ms: 42000,
  transcript_text: 'Some transcript',
  transcription_status: 'done',
  error_code: null,
  error_message: null,
  deleted_at: null,
  created_at: Date.now(),
  updated_at: Date.now(),
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockUpdateRecording.mockResolvedValue(undefined);
  mockSoftDelete.mockResolvedValue(undefined);
});

// ── Tests ─────────────────────────────────────────────────────────────────────

it('renders playback controls', async () => {
  mockGetRecording.mockResolvedValue(makeRecording());
  const { getByTestId } = render(<DetailScreen />);
  await waitFor(() => getByTestId('play-pause'));
  expect(getByTestId('rewind')).toBeTruthy();
  expect(getByTestId('forward')).toBeTruthy();
  expect(getByTestId('scrub-bar')).toBeTruthy();
});

it('export button is disabled when status is pending', async () => {
  mockGetRecording.mockResolvedValue(makeRecording({ transcription_status: 'pending', transcript_text: null }));
  const { getByTestId } = render(<DetailScreen />);
  await waitFor(() => getByTestId('export-button'));

  fireEvent.press(getByTestId('export-button'));
  expect(exportRecording).not.toHaveBeenCalled();
});

it('export button is enabled when status is done', async () => {
  mockGetRecording.mockResolvedValue(makeRecording({ transcription_status: 'done' }));
  const { getByTestId } = render(<DetailScreen />);
  await waitFor(() => getByTestId('export-button'));

  fireEvent.press(getByTestId('export-button'));
  await waitFor(() => expect(exportRecording).toHaveBeenCalledTimes(1));
});

it('rename updates title', async () => {
  mockGetRecording.mockResolvedValue(makeRecording());
  const { getByTestId } = render(<DetailScreen />);
  await waitFor(() => getByTestId('title'));

  // Long-press title to enter rename mode
  fireEvent(getByTestId('title'), 'longPress');
  await waitFor(() => getByTestId('title-input'));

  fireEvent.changeText(getByTestId('title-input'), 'New Title');
  await act(async () => { fireEvent.press(getByTestId('rename-confirm')); });

  expect(mockUpdateRecording).toHaveBeenCalledWith('r1', expect.objectContaining({ title: 'New Title' }));
});

it('delete soft-deletes and navigates back', async () => {
  mockGetRecording.mockResolvedValue(makeRecording());
  const alertSpy = jest.spyOn(Alert, 'alert');
  const { getByTestId } = render(<DetailScreen />);
  await waitFor(() => getByTestId('delete-button'));

  fireEvent.press(getByTestId('delete-button'));

  const confirmBtn = (alertSpy.mock.calls[0][2] as Array<{ text: string; onPress?: () => void }>)
    .find((b) => b.text === 'Delete');
  await act(async () => { confirmBtn?.onPress?.(); });

  expect(mockSoftDelete).toHaveBeenCalledWith('r1');
  expect(mockBack).toHaveBeenCalled();
});
