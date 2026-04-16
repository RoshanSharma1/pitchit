import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Audio } from 'expo-av';
import * as StorageService from '@/db/StorageService';
import * as RecordingPipeline from '@/services/RecordingPipeline';
import { exportRecording } from '@/services/ExportService';
import type { Recording } from '@/types';

const SPEEDS = [0.75, 1, 1.25, 1.5, 2] as const;

const TRANSCRIPT_MSG: Record<Recording['transcription_status'], string | null> = {
  pending:    'Transcribing…',
  queued:     'Waiting for network…',
  processing: 'Transcribing…',
  done:       null,
  failed:     null,
};

function formatTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export default function DetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [recording, setRecording] = useState<Recording | null>(null);
  const [loading, setLoading] = useState(true);
  const [renaming, setRenaming] = useState(false);
  const [renameText, setRenameText] = useState('');

  // Playback state
  const soundRef = useRef<Audio.Sound | null>(null);
  const [playing, setPlaying] = useState(false);
  const [positionMs, setPositionMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [speed, setSpeed] = useState<typeof SPEEDS[number]>(1);

  const load = useCallback(async () => {
    const r = await StorageService.getRecording(id);
    setRecording(r ?? null);
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // Subscribe to pipeline updates for live transcript arrival.
  useEffect(() => {
    return RecordingPipeline.onRecordingUpdate((updated) => {
      if (updated.id === id) setRecording(updated);
    });
  }, [id]);

  // Load audio when recording is available.
  useEffect(() => {
    if (!recording) return;
    let sound: Audio.Sound;

    Audio.Sound.createAsync({ uri: recording.audio_uri }, { shouldPlay: false })
      .then(({ sound: s }) => {
        sound = s;
        soundRef.current = s;
        s.setOnPlaybackStatusUpdate((status) => {
          if (!status.isLoaded) return;
          setPositionMs(status.positionMillis);
          setDurationMs(status.durationMillis ?? 0);
          if (status.didJustFinish) setPlaying(false);
        });
      })
      .catch(() => {/* audio may not exist in tests */});

    return () => { sound?.unloadAsync(); };
  }, [recording?.audio_uri]);

  async function togglePlay() {
    const s = soundRef.current;
    if (!s) return;
    if (playing) {
      await s.pauseAsync();
      setPlaying(false);
    } else {
      await s.setRateAsync(speed, true);
      await s.playAsync();
      setPlaying(true);
    }
  }

  async function seek(ms: number) {
    await soundRef.current?.setPositionAsync(ms);
    setPositionMs(ms);
  }

  async function changeSpeed(s: typeof SPEEDS[number]) {
    setSpeed(s);
    if (playing) await soundRef.current?.setRateAsync(s, true);
  }

  async function submitRename() {
    if (!recording || !renameText.trim()) return;
    await StorageService.updateRecording(id, { title: renameText.trim(), updated_at: Date.now() });
    setRecording((r) => r ? { ...r, title: renameText.trim() } : r);
    setRenaming(false);
  }

  async function handleDelete() {
    Alert.alert('Delete recording?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          if (recording) await StorageService.softDeleteRecording(recording.id);
          router.back();
        },
      },
    ]);
  }

  async function handleExport() {
    if (!recording) return;
    await exportRecording(recording, 'Inbox');
  }

  if (loading) {
    return <View style={styles.center} testID="loading"><ActivityIndicator /></View>;
  }
  if (!recording) {
    return <View style={styles.center}><Text>Recording not found.</Text></View>;
  }

  const transcriptMsg = TRANSCRIPT_MSG[recording.transcription_status];
  const exportEnabled = recording.transcription_status === 'done';

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {/* Title / Rename */}
      {renaming ? (
        <View style={styles.renameRow}>
          <TextInput
            testID="title-input"
            value={renameText}
            onChangeText={setRenameText}
            autoFocus
            style={styles.titleInput}
            onSubmitEditing={submitRename}
          />
          <Pressable testID="rename-confirm" onPress={submitRename}>
            <Text style={styles.link}>Save</Text>
          </Pressable>
        </View>
      ) : (
        <Pressable onLongPress={() => { setRenameText(recording.title); setRenaming(true); }}>
          <Text testID="title" style={styles.title}>{recording.title || 'Untitled'}</Text>
        </Pressable>
      )}

      {/* Scrub bar */}
      <View style={styles.scrubRow}>
        <Text style={styles.timeTxt}>{formatTime(positionMs)}</Text>
        <View testID="scrub-bar" style={styles.scrubTrack}>
          <View style={[styles.scrubFill, { flex: durationMs ? positionMs / durationMs : 0 }]} />
        </View>
        <Text style={styles.timeTxt}>{formatTime(durationMs)}</Text>
      </View>

      {/* Playback controls */}
      <View style={styles.controls}>
        <Pressable testID="rewind" onPress={() => seek(Math.max(0, positionMs - 10000))}>
          <Text style={styles.controlTxt}>◀◀</Text>
        </Pressable>
        <Pressable testID="play-pause" onPress={togglePlay} style={styles.playBtn}>
          <Text style={styles.playTxt}>{playing ? '⏸' : '▶'}</Text>
        </Pressable>
        <Pressable testID="forward" onPress={() => seek(Math.min(durationMs, positionMs + 10000))}>
          <Text style={styles.controlTxt}>▶▶</Text>
        </Pressable>
      </View>

      {/* Speed selector */}
      <View style={styles.speedRow}>
        {SPEEDS.map((s) => (
          <Pressable
            key={s}
            testID={`speed-${s}`}
            onPress={() => changeSpeed(s)}
            style={[styles.speedBtn, speed === s && styles.speedActive]}
          >
            <Text style={[styles.speedTxt, speed === s && styles.speedActiveTxt]}>
              {s}×
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Transcript */}
      <View style={styles.transcriptSection}>
        <Text style={styles.sectionLabel}>Transcript</Text>
        {transcriptMsg ? (
          <View style={styles.transcriptStatus}>
            <ActivityIndicator size="small" />
            <Text style={styles.statusTxt}>{transcriptMsg}</Text>
          </View>
        ) : recording.transcription_status === 'failed' ? (
          <Text testID="transcript-failed" style={styles.failedTxt}>
            Transcription failed.{recording.error_code ? ` (${recording.error_code})` : ''}
          </Text>
        ) : (
          <Text testID="transcript-text" style={styles.transcriptTxt}>
            {recording.transcript_text}
          </Text>
        )}
      </View>

      {/* Actions */}
      <Pressable
        testID="export-button"
        style={[styles.exportBtn, !exportEnabled && styles.disabled]}
        onPress={exportEnabled ? handleExport : undefined}
        accessibilityLabel="Export"
      >
        <Text style={[styles.exportTxt, !exportEnabled && styles.disabledTxt]}>Export</Text>
      </Pressable>

      <Pressable testID="delete-button" onPress={handleDelete} style={styles.deleteBtn}>
        <Text style={styles.deleteTxt}>Delete Recording</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, gap: 20 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 22, fontWeight: '600' },
  renameRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  titleInput: { flex: 1, fontSize: 22, borderBottomWidth: 1, borderColor: '#007AFF' },
  link: { color: '#007AFF', fontWeight: '600' },
  scrubRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  scrubTrack: { flex: 1, height: 4, backgroundColor: '#C6C6C8', borderRadius: 2, flexDirection: 'row' },
  scrubFill: { backgroundColor: '#007AFF', borderRadius: 2 },
  timeTxt: { fontSize: 12, color: '#8E8E93', width: 36 },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 32 },
  controlTxt: { fontSize: 22, color: '#007AFF' },
  playBtn: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: '#007AFF', alignItems: 'center', justifyContent: 'center',
  },
  playTxt: { color: '#fff', fontSize: 22 },
  speedRow: { flexDirection: 'row', justifyContent: 'center', gap: 8 },
  speedBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: '#F2F2F7' },
  speedActive: { backgroundColor: '#007AFF' },
  speedTxt: { fontSize: 14, color: '#000' },
  speedActiveTxt: { color: '#fff' },
  transcriptSection: { gap: 8 },
  sectionLabel: { fontSize: 13, fontWeight: '600', color: '#8E8E93', textTransform: 'uppercase' },
  transcriptStatus: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusTxt: { color: '#8E8E93' },
  failedTxt: { color: '#FF3B30' },
  transcriptTxt: { fontSize: 16, lineHeight: 24 },
  exportBtn: {
    backgroundColor: '#007AFF', borderRadius: 12,
    padding: 16, alignItems: 'center',
  },
  exportTxt: { color: '#fff', fontWeight: '600', fontSize: 17 },
  disabled: { opacity: 0.4 },
  disabledTxt: {},
  deleteBtn: { alignItems: 'center', padding: 12 },
  deleteTxt: { color: '#FF3B30', fontSize: 17 },
});
