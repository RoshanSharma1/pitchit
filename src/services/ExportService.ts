/**
 * ExportService — exports a recording as a Markdown file and shares it.
 *
 * Behaviour:
 *   - Builds a Markdown string with YAML front-matter
 *   - Writes to CacheDirectory/<id>.md
 *   - Calls expo-sharing.shareAsync() with the file path
 */

import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Recording } from '@/types';

/**
 * Export a recording to a Markdown file and open the share sheet.
 *
 * @param recording - The recording to export
 * @param folderName - Display name of the folder the recording belongs to
 */
export async function exportRecording(
  recording: Recording,
  folderName: string,
): Promise<void> {
  const durationSec = Math.round(recording.duration_ms / 1000);
  const date = new Date(recording.created_at).toISOString();

  const markdown = [
    '---',
    `title: "${recording.title}"`,
    `date: ${date}`,
    `folder: "${folderName}"`,
    `duration: ${durationSec}s`,
    '---',
    '',
    recording.transcript_text ?? '',
  ].join('\n');

  const path = `${FileSystem.cacheDirectory}${recording.id}.md`;
  await FileSystem.writeAsStringAsync(path, markdown, {
    encoding: FileSystem.EncodingType.UTF8,
  });

  await Sharing.shareAsync(path);
}
