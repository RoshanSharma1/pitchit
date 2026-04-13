import { View, Text, StyleSheet } from 'react-native';

/** Placeholder HomeScreen — implemented in TASK-011. */
export default function HomeScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>PitchIt</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
  },
});
