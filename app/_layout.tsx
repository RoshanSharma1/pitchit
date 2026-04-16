import { Stack } from 'expo-router';

export default function RootLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'PitchIt' }} />
      <Stack.Screen name="folder/[id]" options={{ title: '' }} />
    </Stack>
  );
}
