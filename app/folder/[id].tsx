import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as FileSystem from 'expo-file-system';
import * as StorageService from '@/db/StorageService';
import * as RecordingPipeline from '@/services/RecordingPipeline';
import type { Recording } from '@/types';

const STATUS_BADGE: Record<Recording['transcription_status'], { label: string; color: string }> = {
  pending:    { label: '◌ pending',    color: '#8E8E93' },
  queued:     { label: '↑ queued',     color: '#007AFF' },
  processing: { label: '⟳ processing', color: '#FF9500' },
  done:       { label: '● done',       color: '#34C759' },
  failed:     { label: '⚠ failed',     color: '#FF3B30' },
};

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function FolderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setRecordings(await StorageService.getRecordingsForFolder(id));
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // Subscribe to pipeline updates — update matching row in-place.
  useEffect(() => {
    return RecordingPipeline.onRecordingUpdate((updated) => {
      setRecordings((prev) =>
        prev.map((r) => (r.id === updated.id ? updated : r)),
      );
    });
  }, []);

  async function handleDelete(recording: Recording) {
    Alert.alert('Delete recording?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await StorageService.softDeleteRecording(recording.id);
          try { await FileSystem.deleteAsync(recording.audio_uri, { idempotent: true }); } catch {}
          setRecordings((prev) => prev.filter((r) => r.id !== recording.id));
        },
      },
    ]);
  }

  if (loading) {
    return (
      <View style={styles.center} testID="loading">
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <FlatList
      data={recordings}
      keyExtractor={(r) => r.id}
      onRefresh={load}
      refreshing={loading}
      ListEmptyComponent={
        <Text style={styles.empty}>No recordings yet. Tap ● to start.</Text>
      }
      renderItem={({ item }) => {
        const badge = STATUS_BADGE[item.transcription_status];
        return (
          <Pressable
            testID={`recording-row-${item.id}`}
            style={styles.row}
            onPress={() => router.push(`/recording/${item.id}`)}
            onLongPress={() => handleDelete(item)}
          >
            <View style={styles.rowTop}>
              <Text style={styles.title} numberOfLines={1}>{item.title || 'Untitled'}</Text>
            </View>
            <View style={styles.rowBottom}>
              <Text style={styles.meta}>{formatDuration(item.duration_ms)}</Text>
              <Text testID={`badge-${item.id}`} style={[styles.badge, { color: badge.color }]}>
                {badge.label}
              </Text>
              <Text style={styles.meta}>{formatDate(item.created_at)}</Text>
            </View>
            <Pressable
              testID={`delete-${item.id}`}
              onPress={() => handleDelete(item)}
              style={styles.deleteBtn}
              accessibilityLabel="Delete recording"
            >
              <Text style={styles.deleteTxt}>Delete</Text>
            </Pressable>
          </Pressable>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { textAlign: 'center', marginTop: 40, color: '#8E8E93' },
  row: {
    padding: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#C6C6C8',
  },
  rowTop: { marginBottom: 4 },
  rowBottom: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 17 },
  meta: { fontSize: 13, color: '#8E8E93' },
  badge: { fontSize: 13, fontWeight: '500' },
  deleteBtn: { marginTop: 8, alignSelf: 'flex-end' },
  deleteTxt: { color: '#FF3B30', fontSize: 13 },
});
