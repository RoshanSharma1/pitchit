/**
 * FolderScreen tests (TASK-012).
 * Verifies: recordings rendered, status badge updates on pipeline event,
 * swipe-delete calls softDelete and removes row.
 */

import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import type { Recording } from '@/types';

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'inbox' }),
}));

const mockGetRecordingsForFolder = jest.fn<Promise<Recording[]>, [string]>();
const mockSoftDeleteRecording = jest.fn<Promise<void>, [string]>();

jest.mock('@/db/StorageService', () => ({
  getRecordingsForFolder: (id: string) => mockGetRecordingsForFolder(id),
  softDeleteRecording: (id: string) => mockSoftDeleteRecording(id),
}));

let pipelineCallback: ((r: Recording) => void) | null = null;
jest.mock('@/services/RecordingPipeline', () => ({
  onRecordingUpdate: (cb: (r: Recording) => void) => {
    pipelineCallback = cb;
    return () => { pipelineCallback = null; };
  },
}));

jest.mock('expo-file-system', () => ({
  deleteAsync: jest.fn().mockResolvedValue(undefined),
}));

import FolderScreen from '../../../app/folder/[id]';

// ── Helpers ───────────────────────────────────────────────────────────────────

const makeRecording = (overrides: Partial<Recording> = {}): Recording => ({
  id: 'r1',
  folder_id: 'inbox',
  title: 'Guitar riff',
  audio_uri: 'file://audio/r1.m4a',
  duration_ms: 42000,
  transcript_text: null,
  transcription_status: 'pending',
  error_code: null,
  error_message: null,
  deleted_at: null,
  created_at: Date.now(),
  updated_at: Date.now(),
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  pipelineCallback = null;
  mockSoftDeleteRecording.mockResolvedValue(undefined);
});

// ── Tests ─────────────────────────────────────────────────────────────────────

it('renders recordings', async () => {
  mockGetRecordingsForFolder.mockResolvedValue([makeRecording()]);
  const { getByTestId, getByText } = render(<FolderScreen />);
  await waitFor(() => getByTestId('recording-row-r1'));
  expect(getByText('Guitar riff')).toBeTruthy();
});

it('shows correct status badge', async () => {
  mockGetRecordingsForFolder.mockResolvedValue([makeRecording({ transcription_status: 'done' })]);
  const { getByTestId } = render(<FolderScreen />);
  await waitFor(() => getByTestId('badge-r1'));
  expect(getByTestId('badge-r1').props.children).toContain('done');
});

it('status badge updates on pipeline event', async () => {
  const rec = makeRecording({ transcription_status: 'pending' });
  mockGetRecordingsForFolder.mockResolvedValue([rec]);

  const { getByTestId } = render(<FolderScreen />);
  await waitFor(() => getByTestId('badge-r1'));
  expect(getByTestId('badge-r1').props.children).toContain('pending');

  await act(async () => {
    pipelineCallback?.({ ...rec, transcription_status: 'done' });
  });

  expect(getByTestId('badge-r1').props.children).toContain('done');
});

it('delete calls softDelete and removes row', async () => {
  mockGetRecordingsForFolder.mockResolvedValue([makeRecording()]);
  const alertSpy = jest.spyOn(Alert, 'alert');

  const { getByTestId, queryByTestId } = render(<FolderScreen />);
  await waitFor(() => getByTestId('delete-r1'));

  fireEvent.press(getByTestId('delete-r1'));

  // Confirm the alert
  const confirmBtn = (alertSpy.mock.calls[0][2] as Array<{ text: string; onPress?: () => void }>)
    .find((b) => b.text === 'Delete');
  await act(async () => { confirmBtn?.onPress?.(); });

  expect(mockSoftDeleteRecording).toHaveBeenCalledWith('r1');
  await waitFor(() => expect(queryByTestId('recording-row-r1')).toBeNull());
});
