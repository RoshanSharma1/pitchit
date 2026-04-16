import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as FolderService from '@/services/FolderService';
import type { Folder } from '@/types';

export default function HomeScreen() {
  const router = useRouter();
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(true);
  const [renameTarget, setRenameTarget] = useState<Folder | null>(null);
  const [renameText, setRenameText] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setFolders(await FolderService.getFolders());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function handleLongPress(folder: Folder) {
    const options = ['Rename', ...(folder.is_system ? [] : ['Delete']), 'Cancel'];
    Alert.alert(folder.name, undefined, [
      {
        text: 'Rename',
        onPress: () => { setRenameTarget(folder); setRenameText(folder.name); },
      },
      ...(!folder.is_system ? [{
        text: 'Delete',
        style: 'destructive' as const,
        onPress: () => confirmDelete(folder),
      }] : []),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  }

  function confirmDelete(folder: Folder) {
    Alert.alert(
      'Delete folder?',
      `Recordings in "${folder.name}" will move to Inbox.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await FolderService.deleteFolder(folder.id);
            load();
          },
        },
      ],
    );
  }

  async function submitRename() {
    if (!renameTarget) return;
    await FolderService.renameFolder(renameTarget.id, renameText);
    setRenameTarget(null);
    load();
  }

  if (loading) {
    return (
      <View style={styles.center} testID="loading">
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={folders}
        keyExtractor={(f) => f.id}
        onRefresh={load}
        refreshing={loading}
        ListEmptyComponent={
          <Text style={styles.empty}>Tap ● to record your first idea</Text>
        }
        renderItem={({ item }) => (
          <Pressable
            testID={`folder-row-${item.id}`}
            onPress={() => router.push(`/folder/${item.id}`)}
            onLongPress={() => handleLongPress(item)}
            style={styles.row}
          >
            <Text style={styles.folderName}>{item.name}</Text>
            <Text style={styles.count}>{item.recording_count}</Text>
          </Pressable>
        )}
      />

      {renameTarget && (
        <View testID="rename-modal" style={styles.renameOverlay}>
          <View style={styles.renameBox}>
            <TextInput
              testID="rename-input"
              value={renameText}
              onChangeText={setRenameText}
              autoFocus
              style={styles.renameInput}
            />
            <Pressable testID="rename-confirm" onPress={submitRename}>
              <Text style={styles.renameConfirm}>Save</Text>
            </Pressable>
            <Pressable onPress={() => setRenameTarget(null)}>
              <Text>Cancel</Text>
            </Pressable>
          </View>
        </View>
      )}

      <Pressable
        testID="fab"
        style={styles.fab}
        onPress={() => router.push('/record')}
        accessibilityLabel="New recording"
      >
        <Text style={styles.fabIcon}>●</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { textAlign: 'center', marginTop: 40, color: '#8E8E93' },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#C6C6C8',
  },
  folderName: { fontSize: 17 },
  count: { fontSize: 15, color: '#8E8E93' },
  fab: {
    position: 'absolute',
    bottom: 32,
    right: 24,
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#007AFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabIcon: { color: '#fff', fontSize: 28 },
  renameOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  renameBox: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    width: '80%',
    gap: 12,
  },
  renameInput: {
    borderWidth: 1,
    borderColor: '#C6C6C8',
    borderRadius: 8,
    padding: 8,
    fontSize: 17,
  },
  renameConfirm: { color: '#007AFF', fontWeight: '600' },
});
