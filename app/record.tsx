import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as RecorderService from '@/services/RecorderService';
import * as RecordingPipeline from '@/services/RecordingPipeline';
import { INBOX_FOLDER_ID } from '@/constants';

function formatTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export default function RecordScreen() {
  const router = useRouter();
  const [permitted, setPermitted] = useState<boolean | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [warning, setWarning] = useState(false);
  const [stopped, setStopped] = useState(false);
  const stopping = useRef(false);

  useEffect(() => {
    let mounted = true;

    async function init() {
      const granted = await RecorderService.requestPermission();
      if (!mounted) return;
      setPermitted(granted);
      if (!granted) return;

      RecorderService.onDurationTick((ms) => { if (mounted) setElapsed(ms); });
      RecorderService.onWarning(() => { if (mounted) setWarning(true); });

      await RecordingPipeline.start();
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    }

    init();
    return () => { mounted = false; };
  }, []);

  async function handleStop() {
    if (stopping.current) return;
    stopping.current = true;
    await RecordingPipeline.stop(INBOX_FOLDER_ID);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setStopped(true);
    router.back();
  }

  if (permitted === false) {
    return (
      <View style={styles.center} testID="permission-denied">
        <Text style={styles.permText}>Microphone access required.</Text>
        <Pressable onPress={() => Linking.openSettings()} style={styles.settingsBtn}>
          <Text style={styles.settingsTxt}>Open Settings</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Dismiss — only enabled after stop */}
      <Pressable
        testID="dismiss"
        style={[styles.dismiss, !stopped && styles.disabled]}
        onPress={() => stopped && router.back()}
        accessibilityLabel="Dismiss"
      >
        <Text style={[styles.dismissTxt, !stopped && styles.disabledTxt]}>✕</Text>
      </Pressable>

      {/* Waveform placeholder */}
      <View testID="waveform" style={styles.waveform}>
        {Array.from({ length: 20 }).map((_, i) => (
          <View
            key={i}
            style={[styles.bar, { height: 8 + Math.sin((elapsed / 200 + i) * 0.8) * 16 }]}
          />
        ))}
      </View>

      {/* Timer */}
      <Text testID="timer" style={styles.timer}>{formatTime(elapsed)}</Text>

      {/* 9-min warning */}
      {warning && (
        <View testID="warning-banner" style={styles.warningBanner}>
          <Text style={styles.warningTxt}>⚠ 1 min remaining</Text>
        </View>
      )}

      {/* Stop button */}
      <Pressable testID="stop-button" style={styles.stopBtn} onPress={handleStop}>
        <View style={styles.stopIcon} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#000' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  dismiss: { position: 'absolute', top: 16, right: 16, padding: 8 },
  disabled: { opacity: 0.3 },
  dismissTxt: { color: '#fff', fontSize: 20 },
  disabledTxt: { color: '#888' },
  waveform: { flexDirection: 'row', alignItems: 'center', gap: 3, marginBottom: 24 },
  bar: { width: 4, backgroundColor: '#FF3B30', borderRadius: 2 },
  timer: { fontSize: 48, fontWeight: '200', color: '#fff', marginBottom: 32 },
  warningBanner: {
    backgroundColor: '#FF9500',
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 8,
    marginBottom: 32,
  },
  warningTxt: { color: '#fff', fontWeight: '600' },
  stopBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#FF3B30',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopIcon: { width: 28, height: 28, backgroundColor: '#fff', borderRadius: 4 },
  permText: { fontSize: 17, marginBottom: 16 },
  settingsBtn: { padding: 12 },
  settingsTxt: { color: '#007AFF', fontSize: 17 },
});
