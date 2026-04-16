/**
 * HomeScreen tests (TASK-011).
 * Verifies: folder list renders, FAB navigates to /record,
 * system folder has no Delete option, rename updates list.
 */

import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import type { Folder } from '@/types';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

const mockGetFolders = jest.fn<Promise<Folder[]>, []>();
const mockRenameFolder = jest.fn<Promise<void>, [string, string]>();
const mockDeleteFolder = jest.fn<Promise<void>, [string]>();

jest.mock('@/services/FolderService', () => ({
  getFolders: () => mockGetFolders(),
  renameFolder: (id: string, name: string) => mockRenameFolder(id, name),
  deleteFolder: (id: string) => mockDeleteFolder(id),
  createFolder: jest.fn(),
}));

// Import after mocks are set up.
import HomeScreen from '../../../app/index';

// ── Helpers ───────────────────────────────────────────────────────────────────

const inbox: Folder = {
  id: 'inbox', name: 'Inbox', is_system: 1, recording_count: 3,
  created_at: 1000, updated_at: 1000,
};
const userFolder: Folder = {
  id: 'f1', name: 'Song Ideas', is_system: 0, recording_count: 5,
  created_at: 2000, updated_at: 2000,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockGetFolders.mockResolvedValue([inbox, userFolder]);
});

// ── Tests ─────────────────────────────────────────────────────────────────────

it('renders folder list', async () => {
  const { getByTestId, getByText } = render(<HomeScreen />);
  await waitFor(() => getByTestId('folder-row-inbox'));
  expect(getByText('Inbox')).toBeTruthy();
  expect(getByText('Song Ideas')).toBeTruthy();
});

it('FAB navigates to /record', async () => {
  const { getByTestId } = render(<HomeScreen />);
  await waitFor(() => getByTestId('fab'));
  fireEvent.press(getByTestId('fab'));
  expect(mockPush).toHaveBeenCalledWith('/record');
});

it('system folder long-press shows no Delete option', async () => {
  const alertSpy = jest.spyOn(Alert, 'alert');
  const { getByTestId } = render(<HomeScreen />);
  await waitFor(() => getByTestId('folder-row-inbox'));
  fireEvent(getByTestId('folder-row-inbox'), 'longPress');

  const buttons: Array<{ text: string }> = alertSpy.mock.calls[0][2] as Array<{ text: string }>;
  expect(buttons.map((b) => b.text)).not.toContain('Delete');
  expect(buttons.map((b) => b.text)).toContain('Rename');
});

it('user folder long-press shows Delete option', async () => {
  const alertSpy = jest.spyOn(Alert, 'alert');
  const { getByTestId } = render(<HomeScreen />);
  await waitFor(() => getByTestId('folder-row-f1'));
  fireEvent(getByTestId('folder-row-f1'), 'longPress');

  const buttons: Array<{ text: string }> = alertSpy.mock.calls[0][2] as Array<{ text: string }>;
  expect(buttons.map((b) => b.text)).toContain('Delete');
});

it('rename updates the list', async () => {
  mockRenameFolder.mockResolvedValue(undefined);
  mockGetFolders
    .mockResolvedValueOnce([inbox, userFolder])
    .mockResolvedValueOnce([inbox, { ...userFolder, name: 'Renamed' }]);

  const { getByTestId, getByText } = render(<HomeScreen />);
  await waitFor(() => getByTestId('folder-row-f1'));

  // Open rename overlay via Alert mock
  const alertSpy = jest.spyOn(Alert, 'alert');
  fireEvent(getByTestId('folder-row-f1'), 'longPress');
  const renameBtn = (alertSpy.mock.calls[0][2] as Array<{ text: string; onPress?: () => void }>)
    .find((b) => b.text === 'Rename');
  await act(async () => { renameBtn?.onPress?.(); });

  // Submit rename
  fireEvent.changeText(getByTestId('rename-input'), 'Renamed');
  await act(async () => { fireEvent.press(getByTestId('rename-confirm')); });

  expect(mockRenameFolder).toHaveBeenCalledWith('f1', 'Renamed');
  await waitFor(() => getByText('Renamed'));
});
