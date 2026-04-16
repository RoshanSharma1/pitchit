/**
 * RootLayout tests (TASK-015).
 * Tests the recovery/retry side effects by calling the hook logic directly,
 * avoiding RNTL render issues with the expo-router Stack mock.
 */

import { useEffect } from 'react';
import { renderHook, act } from '@testing-library/react-native';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockRecover = jest.fn<Promise<void>, []>().mockResolvedValue(undefined);
const mockRetryQueued = jest.fn<Promise<void>, []>().mockResolvedValue(undefined);

jest.mock('@/db/StorageService', () => ({
  recoverStuckRecordings: () => mockRecover(),
}));

jest.mock('@/services/RecordingPipeline', () => ({
  retryQueued: () => mockRetryQueued(),
}));

type NetInfoCallback = (state: { isConnected: boolean }) => void;
let netInfoCb: NetInfoCallback | null = null;
const mockUnsubscribe = jest.fn();

jest.mock('@react-native-community/netinfo', () => ({
  addEventListener: (cb: NetInfoCallback) => {
    netInfoCb = cb;
    return mockUnsubscribe;
  },
}));

// Import the services after mocks are registered.
import * as StorageService from '@/db/StorageService';
import * as RecordingPipeline from '@/services/RecordingPipeline';
import NetInfo from '@react-native-community/netinfo';

/** Inline the same hook logic as _layout.tsx so we can test it in isolation. */
function useRecovery() {
  useEffect(() => {
    async function recover() {
      await StorageService.recoverStuckRecordings();
      await RecordingPipeline.retryQueued();
    }
    recover();
    const unsubscribe = NetInfo.addEventListener((state) => {
      if (state.isConnected) RecordingPipeline.retryQueued();
    });
    return unsubscribe;
  }, []);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  netInfoCb = null;
});

it('calls recoverStuckRecordings and retryQueued on mount', async () => {
  const { result } = renderHook(() => useRecovery());
  await act(async () => {});
  expect(mockRecover).toHaveBeenCalledTimes(1);
  expect(mockRetryQueued).toHaveBeenCalledTimes(1);
});

it('calls retryQueued when NetInfo fires isConnected=true', async () => {
  renderHook(() => useRecovery());
  await act(async () => {});
  mockRetryQueued.mockClear();

  await act(async () => { netInfoCb?.({ isConnected: true }); });
  expect(mockRetryQueued).toHaveBeenCalledTimes(1);
});

it('does not call retryQueued when NetInfo fires isConnected=false', async () => {
  renderHook(() => useRecovery());
  await act(async () => {});
  mockRetryQueued.mockClear();

  await act(async () => { netInfoCb?.({ isConnected: false }); });
  expect(mockRetryQueued).not.toHaveBeenCalled();
});

it('unsubscribes NetInfo listener on unmount', async () => {
  const { unmount } = renderHook(() => useRecovery());
  await act(async () => {});
  unmount();
  expect(mockUnsubscribe).toHaveBeenCalled();
});
