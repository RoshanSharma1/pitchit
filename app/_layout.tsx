import { useEffect } from 'react';
import { Stack } from 'expo-router';
import NetInfo from '@react-native-community/netinfo';
import * as StorageService from '@/db/StorageService';
import * as RecordingPipeline from '@/services/RecordingPipeline';

export default function RootLayout() {
  useEffect(() => {
    // On mount: recover stuck recordings then retry any pending/queued ones.
    async function recover() {
      await StorageService.recoverStuckRecordings();
      await RecordingPipeline.retryQueued();
    }
    recover();

    // Retry whenever connectivity is restored.
    const unsubscribe = NetInfo.addEventListener((state) => {
      if (state.isConnected) RecordingPipeline.retryQueued();
    });

    return unsubscribe;
  }, []);

  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'PitchIt' }} />
      <Stack.Screen name="folder/[id]" options={{ title: '' }} />
      <Stack.Screen name="record" options={{ presentation: 'modal', title: 'Recording' }} />
      <Stack.Screen name="recording/[id]" options={{ title: '' }} />
    </Stack>
  );
}
