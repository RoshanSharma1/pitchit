import { TranscriptionStatus } from '@/types';
import { INBOX_FOLDER_ID, MAX_RECORDING_DURATION_MS } from '@/constants';

/** Compile-time exhaustiveness check — fails TS if a status value is missing. */
function assertExhaustive(status: TranscriptionStatus): string {
  switch (status) {
    case 'pending': return status;
    case 'queued': return status;
    case 'processing': return status;
    case 'done': return status;
    case 'failed': return status;
  }
}

describe('TranscriptionStatus', () => {
  const allStatuses: TranscriptionStatus[] = [
    'pending',
    'queued',
    'processing',
    'done',
    'failed',
  ];

  it('covers exactly five values', () => {
    expect(allStatuses).toHaveLength(5);
  });

  it('exhaustive switch compiles without default branch', () => {
    allStatuses.forEach((s) => {
      expect(assertExhaustive(s)).toBe(s);
    });
  });
});

describe('Constants', () => {
  it('INBOX_FOLDER_ID is the string "inbox"', () => {
    expect(INBOX_FOLDER_ID).toBe('inbox');
  });

  it('MAX_RECORDING_DURATION_MS is 10 minutes in ms', () => {
    expect(MAX_RECORDING_DURATION_MS).toBe(600_000);
  });
});
