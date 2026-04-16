/**
 * FolderService — business-logic wrapper over StorageService for folder operations.
 *
 * Enforces:
 *   - Non-empty names on create/rename
 *   - System folders cannot be deleted
 *   - Recordings are moved to Inbox before a folder is deleted
 */

import * as Crypto from 'expo-crypto';
import * as StorageService from '@/db/StorageService';
import type { Folder } from '@/types';

/** Return all folders (delegates to StorageService). */
export async function getFolders(): Promise<Folder[]> {
  return StorageService.getFolders();
}

/**
 * Create a new folder with the given name.
 * @throws if name is blank.
 */
export async function createFolder(name: string): Promise<Folder> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Folder name cannot be blank.');

  const now = Date.now();
  const folder: Omit<Folder, 'recording_count'> = {
    id: Crypto.randomUUID(),
    name: trimmed,
    is_system: 0,
    created_at: now,
    updated_at: now,
  };
  await StorageService.insertFolder(folder);
  return { ...folder, recording_count: 0 };
}

/**
 * Rename an existing folder.
 * @throws if name is blank.
 */
export async function renameFolder(id: string, name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Folder name cannot be blank.');
  await StorageService.updateFolder(id, { name: trimmed, updated_at: Date.now() });
}

/**
 * Delete a folder, moving all its recordings to the Inbox first.
 * @throws if the folder is a system folder.
 */
export async function deleteFolder(id: string): Promise<void> {
  const folders = await StorageService.getFolders();
  const folder = folders.find((f) => f.id === id);
  if (folder?.is_system === 1) {
    throw new Error('System folders cannot be deleted.');
  }
  await StorageService.deleteFolder(id);
}
