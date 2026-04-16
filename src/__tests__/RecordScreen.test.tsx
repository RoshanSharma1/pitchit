/**
 * RecordScreen tests (TASK-013).
 * Verifies: permission denied state shown; timer increments;
 * stop button calls pipeline stop; haptic called on start and stop.
 */

import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockBack = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ back: mockBack }) }));

const mockRequestPermission = jest.fn<Promise<boolean>, []>();
let tickCb: ((ms: number) => void) | null = null;
let warningCb: (() => void) | null = null;

jest.mock('@/services/RecorderService', () => ({
  requestPermission: () => mockRequestPermission(),
  onDurationTick: (cb: (ms: number) => void) => { tickCb = cb; },
  onWarning: (cb: () => void) => { warningCb = cb; },
}));

const mockPipelineStart = jest.fn<Promise<void>, []>();
const mockPipelineStop = jest.fn<Promise<void>, [string]>();

jest.mock('@/services/RecordingPipeline', () => ({
  start: () => mockPipelineStart(),
  stop: (folderId: string) => mockPipelineStop(folderId),
}));

const mockHapticImpact = jest.fn();
const mockHapticNotification = jest.fn();
jest.mock('expo-haptics', () => ({
  impactAsync: (...args: unknown[]) => mockHapticImpact(...args),
  notificationAsync: (...args: unknown[]) => mockHapticNotification(...args),
  ImpactFeedbackStyle: { Heavy: 'Heavy' },
  NotificationFeedbackType: { Success: 'Success' },
}));

import RecordScreen from '../../../app/record';

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  tickCb = null;
  warningCb = null;
  mockPipelineStart.mockResolvedValue(undefined);
  mockPipelineStop.mockResolvedValue(undefined as unknown as void);
});

// ── Tests ─────────────────────────────────────────────────────────────────────

it('shows permission denied state when mic is refused', async () => {
  mockRequestPermission.mockResolvedValue(false);
  const { getByTestId } = render(<RecordScreen />);
  await waitFor(() => getByTestId('permission-denied'));
});

it('timer increments when tick callback fires', async () => {
  mockRequestPermission.mockResolvedValue(true);
  const { getByTestId } = render(<RecordScreen />);
  await waitFor(() => getByTestId('timer'));

  expect(getByTestId('timer').props.children).toBe('00:00');

  await act(async () => { tickCb?.(5000); });
  expect(getByTestId('timer').props.children).toBe('00:05');
});

it('stop button calls pipeline stop and haptic', async () => {
  mockRequestPermission.mockResolvedValue(true);
  const { getByTestId } = render(<RecordScreen />);
  await waitFor(() => getByTestId('stop-button'));

  await act(async () => { fireEvent.press(getByTestId('stop-button')); });

  expect(mockPipelineStop).toHaveBeenCalledTimes(1);
  expect(mockHapticNotification).toHaveBeenCalledWith('Success');
});

it('haptic fires on start', async () => {
  mockRequestPermission.mockResolvedValue(true);
  render(<RecordScreen />);
  await waitFor(() => expect(mockHapticImpact).toHaveBeenCalledWith('Heavy'));
});

it('warning banner appears at 9-min mark', async () => {
  mockRequestPermission.mockResolvedValue(true);
  const { getByTestId, queryByTestId } = render(<RecordScreen />);
  await waitFor(() => getByTestId('timer'));

  expect(queryByTestId('warning-banner')).toBeNull();
  await act(async () => { warningCb?.(); });
  expect(getByTestId('warning-banner')).toBeTruthy();
});
