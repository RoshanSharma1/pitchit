/**
 * FolderService unit tests.
 * StorageService is fully mocked so tests only verify business-rule logic.
 */

import type { Folder } from '@/types';
import { INBOX_FOLDER_ID } from '@/constants';

// ── Mock StorageService ───────────────────────────────────────────────────────

const mockGetFolders = jest.fn<Promise<Folder[]>, []>();
const mockInsertFolder = jest.fn<Promise<void>, [Omit<Folder, 'recording_count'>]>();
const mockUpdateFolder = jest.fn<Promise<void>, [string, Partial<Folder>]>();
const mockDeleteFolder = jest.fn<Promise<void>, [string]>();

jest.mock('@/db/StorageService', () => ({
  getFolders: () => mockGetFolders(),
  insertFolder: (f: Omit<Folder, 'recording_count'>) => mockInsertFolder(f),
  updateFolder: (id: string, patch: Partial<Folder>) => mockUpdateFolder(id, patch),
  deleteFolder: (id: string) => mockDeleteFolder(id),
}));

import * as FolderService from '@/services/FolderService';

const makeFolder = (overrides: Partial<Folder> = {}): Folder => ({
  id: 'folder-1',
  name: 'Ideas',
  is_system: 0,
  recording_count: 0,
  created_at: 1000,
  updated_at: 1000,
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockGetFolders.mockResolvedValue([]);
  mockInsertFolder.mockResolvedValue();
  mockUpdateFolder.mockResolvedValue();
  mockDeleteFolder.mockResolvedValue();
});

// ── createFolder ──────────────────────────────────────────────────────────────

describe('createFolder', () => {
  it('creates a folder with a valid name', async () => {
    const folder = await FolderService.createFolder('Ideas');
    expect(folder.name).toBe('Ideas');
    expect(folder.is_system).toBe(0);
    expect(mockInsertFolder).toHaveBeenCalledTimes(1);
  });

  it('trims whitespace from the name', async () => {
    const folder = await FolderService.createFolder('  Ideas  ');
    expect(folder.name).toBe('Ideas');
  });

  it('throws when name is blank', async () => {
    await expect(FolderService.createFolder('')).rejects.toThrow('blank');
  });

  it('throws when name is only whitespace', async () => {
    await expect(FolderService.createFolder('   ')).rejects.toThrow('blank');
  });

  it('generates a unique id', async () => {
    const a = await FolderService.createFolder('A');
    const b = await FolderService.createFolder('B');
    expect(a.id).not.toBe(b.id);
  });
});

// ── renameFolder ──────────────────────────────────────────────────────────────

describe('renameFolder', () => {
  it('calls updateFolder with the new name', async () => {
    await FolderService.renameFolder('folder-1', 'New Name');
    expect(mockUpdateFolder).toHaveBeenCalledWith(
      'folder-1',
      expect.objectContaining({ name: 'New Name' }),
    );
  });

  it('throws when new name is blank', async () => {
    await expect(FolderService.renameFolder('folder-1', '')).rejects.toThrow('blank');
  });
});

// ── deleteFolder ──────────────────────────────────────────────────────────────

describe('deleteFolder', () => {
  it('deletes a regular folder', async () => {
    mockGetFolders.mockResolvedValue([makeFolder({ id: 'folder-1', is_system: 0 })]);
    await FolderService.deleteFolder('folder-1');
    expect(mockDeleteFolder).toHaveBeenCalledWith('folder-1');
  });

  it('throws when attempting to delete a system folder', async () => {
    mockGetFolders.mockResolvedValue([
      makeFolder({ id: INBOX_FOLDER_ID, is_system: 1 }),
    ]);
    await expect(FolderService.deleteFolder(INBOX_FOLDER_ID)).rejects.toThrow(
      'System folders cannot be deleted.',
    );
    expect(mockDeleteFolder).not.toHaveBeenCalled();
  });

  it('recordings are moved to Inbox (delegated to StorageService.deleteFolder)', async () => {
    mockGetFolders.mockResolvedValue([makeFolder({ id: 'f-del', is_system: 0 })]);
    await FolderService.deleteFolder('f-del');
    // StorageService.deleteFolder handles the recording migration.
    expect(mockDeleteFolder).toHaveBeenCalledWith('f-del');
  });
});
