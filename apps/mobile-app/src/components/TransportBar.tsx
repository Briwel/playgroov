import { Pause, Play, SkipBack, SkipForward } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useState } from 'react';

import { theme } from '../theme';

type TransportBarProps = {
  isPlaying: boolean;
  enabled: boolean;
  positionMillis: number;
  durationMillis: number;
  onToggle: () => void;
  onSeek: (position: number) => void;
};

export function TransportBar({ isPlaying, enabled, positionMillis, durationMillis, onToggle, onSeek }: TransportBarProps) {
  const compact = useWindowDimensions().width < 620;
  const [timelineWidth, setTimelineWidth] = useState(0);
  const progress = durationMillis > 0 ? Math.min(100, (positionMillis / durationMillis) * 100) : 0;

  return (
    <View style={[styles.container, compact && styles.containerCompact, !enabled && styles.disabled]}>
      <View style={[styles.transportTitle, compact && styles.transportTitleCompact]}>
        <Text style={styles.kicker}>TRANSPORT</Text>
        <Text numberOfLines={1} style={styles.trackName}>{enabled ? 'Session multipiste' : 'Aucune session chargée'}</Text>
      </View>
      <View style={styles.controls}>
        <Pressable disabled={!enabled} onPress={() => onSeek(0)} style={styles.utilityButton} accessibilityRole="button" accessibilityLabel="Revenir au début"><SkipBack size={16} color={theme.colors.grisSignal} /></Pressable>
        <Pressable disabled={!enabled} onPress={onToggle} style={({ pressed }) => [styles.playButton, pressed && styles.playPressed, !enabled && styles.playDisabled]} accessibilityRole="button" accessibilityLabel={isPlaying ? 'Mettre en pause' : 'Lire les pistes'}>
          {isPlaying ? <Pause size={16} fill={theme.colors.nuitStudio} color={theme.colors.nuitStudio} /> : <Play size={16} fill={theme.colors.nuitStudio} color={theme.colors.nuitStudio} style={styles.playIcon} />}
        </Pressable>
        <Pressable disabled={!enabled} onPress={() => onSeek(Math.min(durationMillis, positionMillis + 10000))} style={styles.utilityButton} accessibilityRole="button" accessibilityLabel="Avancer de dix secondes"><SkipForward size={16} color={theme.colors.grisSignal} /></Pressable>
      </View>
      <View style={[styles.timeline, compact && styles.timelineCompact]}>
        <Text style={styles.time}>{formatTime(positionMillis)}</Text>
        <Pressable
          disabled={!enabled || durationMillis === 0}
          onPress={(event) => {
            const ratio = timelineWidth > 0 ? Math.max(0, Math.min(1, event.nativeEvent.locationX / timelineWidth)) : 0;
            onSeek(ratio * durationMillis);
          }}
          onLayout={(event) => setTimelineWidth(event.nativeEvent.layout.width)}
          style={styles.progressTrack}
          accessibilityRole="adjustable"
          accessibilityLabel="Position de lecture"
          accessibilityValue={{ min: 0, max: 100, now: Math.round(progress) }}>
          <View style={[styles.progress, { width: `${progress}%` }]} />
          {enabled && <View style={[styles.playhead, { left: `${progress}%` }]} />}
        </Pressable>
        <Text style={styles.time}>{formatTime(durationMillis)}</Text>
      </View>
    </View>
  );
}

function formatTime(milliseconds: number) {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  container: { minHeight: 76, borderWidth: 1, borderColor: theme.colors.ligne, borderRadius: 10, backgroundColor: theme.colors.console, paddingHorizontal: 14, paddingVertical: 11, flexDirection: 'row', alignItems: 'center', gap: 14 },
  containerCompact: { flexWrap: 'wrap', rowGap: 9 },
  disabled: { opacity: 0.65 },
  transportTitle: { width: 170 },
  transportTitleCompact: { flex: 1, width: undefined },
  kicker: { color: theme.colors.vertStudio, fontSize: 9, letterSpacing: 1.1, fontWeight: '700' },
  trackName: { color: theme.colors.blancCasse, fontFamily: theme.typography.manrope.medium, fontSize: 11, fontWeight: '600', marginTop: 5 },
  controls: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  utilityButton: { width: 30, height: 32, alignItems: 'center', justifyContent: 'center' },
  playButton: { width: 38, height: 38, borderRadius: 19, backgroundColor: theme.colors.vertStudio, alignItems: 'center', justifyContent: 'center' },
  playPressed: { opacity: 0.75, transform: [{ scale: 0.96 }] },
  playDisabled: { backgroundColor: '#52564D' },
  playIcon: { marginLeft: 2 },
  timeline: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 9 },
  timelineCompact: { flexBasis: '100%', flexGrow: 1 },
  time: { color: theme.colors.grisSignal, fontSize: 10, fontVariant: ['tabular-nums'] },
  progressTrack: { height: 5, flex: 1, borderRadius: 3, backgroundColor: '#3C4038', justifyContent: 'center' },
  progress: { height: 5, borderRadius: 3, backgroundColor: theme.colors.vertStudio },
  playhead: { position: 'absolute', width: 9, height: 9, marginLeft: -4, borderRadius: 5, backgroundColor: theme.colors.blancCasse },
});
