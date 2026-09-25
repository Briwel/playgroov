import { AudioLines, Minus, Plus } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { theme } from '../theme';

type TrackStripProps = {
  name: string;
  color: string;
  level: number;
  muted: boolean;
  solo: boolean;
  compact?: boolean;
  onLevelChange: (value: number) => void;
  onToggleMute: () => void;
  onToggleSolo: () => void;
};

export function TrackStrip({ name, color, level, muted, solo, compact = false, onLevelChange, onToggleMute, onToggleSolo }: TrackStripProps) {
  const db = (level - 7) * 2;
  return (
    <View style={[styles.container, compact && styles.containerCompact, muted && styles.containerMuted]}>
      <View style={[styles.colorRail, { backgroundColor: color }]} />
      {compact ? (
        <>
          <View style={styles.compactHeader}>
            <View style={[styles.trackInfo, styles.trackInfoCompact]}>
              <View style={[styles.instrumentIcon, { backgroundColor: `${color}20` }]}><AudioLines size={15} color={color} /></View>
              <View style={styles.nameBlock}><Text numberOfLines={1} style={styles.name}>{name}</Text><Text style={styles.trackType}>AUDIO · STEREO</Text></View>
            </View>
            <View style={styles.trackActions}>
              <Pressable onPress={onToggleSolo} accessibilityRole="button" accessibilityState={{ selected: solo }} accessibilityLabel={`${solo ? 'Désactiver' : 'Activer'} solo ${name}`} style={[styles.actionButton, solo && styles.soloActive]}><Text style={[styles.actionText, solo && styles.soloText]}>S</Text></Pressable>
              <Pressable onPress={onToggleMute} accessibilityRole="button" accessibilityState={{ selected: muted }} accessibilityLabel={`${muted ? 'Réactiver' : 'Couper'} ${name}`} style={[styles.actionButton, muted && styles.muteActive]}><Text style={[styles.actionText, muted && styles.muteText]}>M</Text></Pressable>
            </View>
          </View>
          <View style={styles.compactControls}>
            <View style={styles.gainMeter} accessibilityLabel={`Niveau de ${name}: ${level} sur 12`}>
              {Array.from({ length: 12 }, (_, index) => <View key={index} style={[styles.gainSegment, { backgroundColor: index < level ? color : '#383B35', opacity: muted ? 0.25 : 1 }]} />)}
            </View>
            <View style={styles.levelControl}>
              <Pressable onPress={() => onLevelChange(Math.max(0, level - 1))} style={[styles.gainButton, styles.gainButtonCompact]} accessibilityRole="button" accessibilityLabel={`Baisser le niveau de ${name}`}><Minus size={14} color={theme.colors.grisSignal} /></Pressable>
              <Text style={styles.levelText}>{level === 0 ? '−∞' : `${db > 0 ? '+' : '−'}${String(Math.abs(db)).padStart(2, '0')}`}<Text style={styles.decibel}> dB</Text></Text>
              <Pressable onPress={() => onLevelChange(Math.min(12, level + 1))} style={[styles.gainButton, styles.gainButtonCompact]} accessibilityRole="button" accessibilityLabel={`Monter le niveau de ${name}`}><Plus size={14} color={theme.colors.grisSignal} /></Pressable>
            </View>
          </View>
        </>
      ) : (
        <>
          <View style={styles.trackInfo}>
            <View style={[styles.instrumentIcon, { backgroundColor: `${color}20` }]}><AudioLines size={14} color={color} /></View>
            <View style={styles.nameBlock}><Text numberOfLines={1} style={styles.name}>{name}</Text><Text style={styles.trackType}>AUDIO · STEREO</Text></View>
          </View>
          <View style={styles.gainMeter} accessibilityLabel={`Niveau de ${name}: ${level} sur 12`}>
            {Array.from({ length: 12 }, (_, index) => <View key={index} style={[styles.gainSegment, { backgroundColor: index < level ? color : '#383B35', opacity: muted ? 0.25 : 1 }]} />)}
          </View>
          <View style={styles.levelControl}>
            <Pressable onPress={() => onLevelChange(Math.max(0, level - 1))} style={styles.gainButton} accessibilityRole="button" accessibilityLabel={`Baisser le niveau de ${name}`}><Minus size={12} color={theme.colors.grisSignal} /></Pressable>
            <Text style={styles.levelText}>{level === 0 ? '−∞' : `${db > 0 ? '+' : '−'}${String(Math.abs(db)).padStart(2, '0')}`}<Text style={styles.decibel}> dB</Text></Text>
            <Pressable onPress={() => onLevelChange(Math.min(12, level + 1))} style={styles.gainButton} accessibilityRole="button" accessibilityLabel={`Monter le niveau de ${name}`}><Plus size={12} color={theme.colors.grisSignal} /></Pressable>
          </View>
          <View style={styles.trackActions}>
            <Pressable onPress={onToggleSolo} accessibilityRole="button" accessibilityState={{ selected: solo }} accessibilityLabel={`${solo ? 'Désactiver' : 'Activer'} solo ${name}`} style={[styles.actionButton, solo && styles.soloActive]}><Text style={[styles.actionText, solo && styles.soloText]}>S</Text></Pressable>
            <Pressable onPress={onToggleMute} accessibilityRole="button" accessibilityState={{ selected: muted }} accessibilityLabel={`${muted ? 'Réactiver' : 'Couper'} ${name}`} style={[styles.actionButton, muted && styles.muteActive]}><Text style={[styles.actionText, muted && styles.muteText]}>M</Text></Pressable>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { minHeight: 66, flexDirection: 'row', alignItems: 'center', borderRadius: 9, borderWidth: 1, borderColor: theme.colors.ligne, backgroundColor: theme.colors.console, overflow: 'hidden', paddingRight: 9 },
  containerCompact: { minHeight: 104, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', paddingRight: 10, paddingBottom: 11 },
  containerMuted: { opacity: 0.66 },
  colorRail: { width: 3, alignSelf: 'stretch' },
  trackInfo: { width: 124, flexDirection: 'row', alignItems: 'center', gap: 9, paddingLeft: 10 },
  trackInfoCompact: { flex: 1, width: 'auto', minWidth: 0, gap: 8, paddingLeft: 8 },
  compactHeader: { flex: 1, minWidth: 0, flexBasis: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 10, paddingRight: 2 },
  compactControls: { flex: 1, minWidth: 0, flexBasis: '100%', flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 10, marginTop: 9 },
  instrumentIcon: { width: 29, height: 29, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  nameBlock: { flex: 1 },
  name: { color: theme.colors.blancCasse, fontFamily: theme.typography.manrope.semiBold, fontSize: 12, fontWeight: '600' },
  trackType: { color: theme.colors.grisSignal, fontSize: 8, letterSpacing: 0.7, marginTop: 4 },
  gainMeter: { flex: 1, minWidth: 30, height: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2, overflow: 'hidden', marginHorizontal: 6 },
  gainSegment: { flex: 1, height: 10, maxWidth: 8, minWidth: 2, borderRadius: 2 },
  levelControl: { flexDirection: 'row', alignItems: 'center', gap: 3, marginHorizontal: 5 },
  gainButton: { width: 22, height: 25, alignItems: 'center', justifyContent: 'center' },
  gainButtonCompact: { width: 36, height: 36, borderWidth: 1, borderColor: theme.colors.ligne, borderRadius: 8 },
  levelText: { color: theme.colors.blancCasse, fontSize: 9, fontVariant: ['tabular-nums'], minWidth: 34, textAlign: 'center' },
  decibel: { color: theme.colors.grisSignal, fontSize: 8 },
  trackActions: { flexDirection: 'row', gap: 4 },
  actionButton: { width: 36, height: 36, borderRadius: 8, borderWidth: 1, borderColor: theme.colors.ligne, alignItems: 'center', justifyContent: 'center', backgroundColor: '#20221F' },
  actionText: { color: theme.colors.grisSignal, fontSize: 10, fontWeight: '700' },
  soloActive: { backgroundColor: '#49391F', borderColor: theme.colors.ambre },
  soloText: { color: theme.colors.ambre },
  muteActive: { backgroundColor: '#402A27', borderColor: theme.colors.state.erreur },
  muteText: { color: theme.colors.state.erreur },
});
