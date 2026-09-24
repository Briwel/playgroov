import { useCallback, useEffect, useRef, useState } from 'react';
import { Audio } from 'expo-av';
import { Link, useLocalSearchParams } from 'expo-router';
import { AudioLines, AudioWaveform, ChevronDown, Headphones, RotateCcw, SlidersHorizontal, Volume2 } from 'lucide-react-native';
import axios from 'axios';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { BackButton } from '../../src/components/BackButton';
import { TrackStrip } from '../../src/components/TrackStrip';
import { TransportBar } from '../../src/components/TransportBar';
import { API_URL } from '../../src/constants/api';
import { theme } from '../../src/theme';

type Stem = { filename: string; name: string; taskId: string };
type Track = { id: string; title: string; status: string; stems: Stem[] };
type LoadedStem = Stem & { sound: Audio.Sound; color: string; label: string };

const instrumentColors: Record<string, string> = {
  vocals: theme.colors.stems.voix,
  drums: theme.colors.stems.batterie,
  bass: theme.colors.stems.basse,
  guitar: theme.colors.stems.guitare,
  piano: theme.colors.stems.piano,
  other: theme.colors.stems.autres,
};

const instrumentLabels: Record<string, string> = {
  vocals: 'Voix', drums: 'Batterie', bass: 'Basse', guitar: 'Guitare', piano: 'Piano', other: 'Autres instruments',
};

function instrumentFor(stemName: string) {
  const normalized = stemName.toLowerCase();
  const key = Object.keys(instrumentLabels).find((instrument) => normalized.includes(instrument)) ?? 'other';
  return { key, label: instrumentLabels[key], color: instrumentColors[key] };
}

function formatTime(milliseconds: number) {
  const seconds = Math.floor(milliseconds / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

export default function MixerScreen() {
  const compact = useWindowDimensions().width < 700;
  const params = useLocalSearchParams<{ trackId?: string | string[] }>();
  const trackId = Array.isArray(params.trackId) ? params.trackId[0] : params.trackId;
  const [track, setTrack] = useState<Track | null>(null);
  const [loadedStems, setLoadedStems] = useState<LoadedStem[]>([]);
  const [muted, setMuted] = useState<string[]>([]);
  const [solo, setSolo] = useState<string | null>(null);
  const [levels, setLevels] = useState<Record<string, number>>({});
  const [masterLevel, setMasterLevel] = useState(12);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [loading, setLoading] = useState(Boolean(trackId));
  const [error, setError] = useState<string | null>(null);
  const soundsRef = useRef<LoadedStem[]>([]);
  const positionRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const createdSounds: LoadedStem[] = [];
    soundsRef.current = [];
    setTrack(null);
    setLoadedStems([]);
    setPlaying(false);
    setPosition(0);
    setDuration(0);
    setError(null);

    if (!trackId) {
      setLoading(false);
      setError('Choisissez un morceau importé et séparé pour afficher ses pistes.');
      return;
    }

    setLoading(true);
    const loadSession = async () => {
      try {
        const response = await axios.get<Track>(`${API_URL}/tracks/${trackId}`);
        const currentTrack = response.data;
        if (cancelled) return;
        setTrack(currentTrack);

        if (!currentTrack.stems?.length) {
          setError(currentTrack.status === 'SPLITTING'
            ? 'La séparation est toujours en cours. Revenez ici lorsque le traitement sera terminé.'
            : 'Ce morceau ne contient pas encore de pistes séparées. Importez-le et lancez la séparation pour commencer.');
          return;
        }

        await Audio.setAudioModeAsync({ playsInSilentModeIOS: true, staysActiveInBackground: false, shouldDuckAndroid: true });
        const results = await Promise.allSettled(currentTrack.stems.map(async (stem, index) => {
          const instrument = instrumentFor(stem.name);
          const uri = `${API_URL}/tracks/${encodeURIComponent(trackId)}/stems/${encodeURIComponent(stem.filename)}`;
          const { sound } = await Audio.Sound.createAsync(
            { uri },
            { shouldPlay: false, volume: 1 },
            (status) => {
              if (cancelled || !status.isLoaded) return;
              if (index === 0) {
                positionRef.current = status.positionMillis;
                setPosition(status.positionMillis);
                if (status.durationMillis) setDuration(status.durationMillis);
              }
              if (status.didJustFinish) setPlaying(false);
            },
          );
          const loadedStem: LoadedStem = { ...stem, sound, ...instrument };
          createdSounds.push(loadedStem);
          return loadedStem;
        }));

        const failedLoad = results.find((result) => result.status === 'rejected');
        if (failedLoad?.status === 'rejected') throw failedLoad.reason;
        const loaded = results.flatMap((result) => result.status === 'fulfilled' ? [result.value] : []);

        if (cancelled) {
          await Promise.all(createdSounds.map(({ sound }) => sound.unloadAsync().catch(() => undefined)));
          return;
        }

        soundsRef.current = loaded;
        setLoadedStems(loaded);
        setLevels(Object.fromEntries(loaded.map((stem) => [stem.filename, 7])));
      } catch (loadError) {
        console.error('Unable to load separated tracks', loadError);
        await Promise.all(createdSounds.map(({ sound }) => sound.unloadAsync().catch(() => undefined)));
        if (!cancelled) setError('Impossible de charger les pistes audio. Vérifiez la connexion au serveur puis réessayez.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadSession();
    return () => {
      cancelled = true;
      void Promise.all(createdSounds.map(({ sound }) => sound.unloadAsync().catch(() => undefined)));
    };
  }, [trackId]);

  useEffect(() => {
    for (const stem of loadedStems) {
      const isMuted = muted.includes(stem.filename) || (solo !== null && solo !== stem.filename);
      const gain = levels[stem.filename] ?? 7;
      const decibels = (gain - 7) * 2;
      const trackVolume = gain === 0 ? 0 : Math.min(1, 10 ** (decibels / 20));
      void stem.sound.setIsMutedAsync(isMuted).catch(() => undefined);
      void stem.sound.setVolumeAsync(trackVolume * (masterLevel / 12)).catch(() => undefined);
    }
  }, [loadedStems, muted, solo, levels, masterLevel]);

  const toggleMute = useCallback((filename: string) => {
    setMuted((current) => current.includes(filename) ? current.filter((item) => item !== filename) : [...current, filename]);
  }, []);

  const changeLevel = useCallback((filename: string, value: number) => {
    setLevels((current) => ({ ...current, [filename]: value }));
  }, []);

  const seek = useCallback(async (nextPosition: number) => {
    const clamped = Math.max(0, Math.min(duration, nextPosition));
    positionRef.current = clamped;
    setPosition(clamped);
    await Promise.all(soundsRef.current.map(({ sound }) => sound.setPositionAsync(clamped).catch(() => undefined)));
  }, [duration]);

  const togglePlayback = useCallback(async () => {
    if (!soundsRef.current.length) return;
    if (playing) {
      await Promise.all(soundsRef.current.map(({ sound }) => sound.pauseAsync().catch(() => undefined)));
      setPlaying(false);
      return;
    }
    await Promise.all(soundsRef.current.map(({ sound }) => sound.playFromPositionAsync(positionRef.current).catch(() => undefined)));
    setPlaying(true);
  }, [playing]);

  const trackCount = loadedStems.length;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.page, compact && styles.pageCompact]}>
      <View style={styles.topbar}>
        <BackButton />
        <View style={styles.brand}><View style={styles.brandMark}><AudioLines size={16} color={theme.colors.nuitStudio} /></View><Text style={styles.brandText}>POCKETGROOVE <Text style={styles.brandSub}>/ MIXEUR</Text></Text></View>
        <View style={styles.topbarSpacer} />
      </View>

      <View style={styles.content}>
        <View style={[styles.headingRow, compact && styles.headingCompact]}>
          <View style={styles.headingCopy}>
            <Text style={styles.eyebrow}>VOTRE SESSION</Text>
            <Text style={styles.title}>{track?.title ?? 'Mixeur audio'}</Text>
            <Text style={styles.subtitle}>{trackCount > 0 ? `${trackCount} piste${trackCount > 1 ? 's' : ''} séparée${trackCount > 1 ? 's' : ''} · Réglez le volume, isolez ou coupez chaque instrument.` : 'Retrouvez ici les instruments séparés de votre morceau.'}</Text>
          </View>
          <Link href="/import" asChild><Pressable style={styles.newTrackButton}><AudioWaveform size={16} color={theme.colors.nuitStudio} /><Text style={styles.newTrackText}>Importer un morceau</Text></Pressable></Link>
        </View>

        {loading ? (
          <View style={styles.stateCard}><ActivityIndicator size="small" color={theme.colors.vertStudio} /><Text style={styles.stateTitle}>Chargement des pistes…</Text><Text style={styles.stateText}>Préparation de la lecture audio.</Text></View>
        ) : error ? (
          <View style={styles.stateCard}>
            <View style={styles.stateIcon}><AudioWaveform size={21} color={theme.colors.vertStudio} /></View>
            <Text style={styles.stateTitle}>{track ? 'Pistes indisponibles' : 'Aucun morceau sélectionné'}</Text>
            <Text style={styles.stateText}>{error}</Text>
            <Link href="/import" asChild><Pressable style={styles.stateButton}><Text style={styles.stateButtonText}>Importer un morceau</Text></Pressable></Link>
          </View>
        ) : (
          <>
            <View style={styles.mixerToolbar}>
              <View style={styles.trackCount}><Text style={styles.trackCountNumber}>{trackCount}</Text><Text style={styles.trackCountLabel}>{trackCount > 1 ? 'PISTES AUDIO' : 'PISTE AUDIO'}</Text></View>
              <View style={styles.toolbarDivider} />
              <View style={styles.mixerMode}><SlidersHorizontal size={15} color={theme.colors.vertStudio} /><Text style={styles.mixerModeText}>CONTRÔLES DE PISTE</Text><ChevronDown size={13} color={theme.colors.grisSignal} /></View>
              <View style={styles.toolbarSpacer} />
              <Pressable onPress={() => { setMuted([]); setSolo(null); setLevels(Object.fromEntries(loadedStems.map((stem) => [stem.filename, 7]))); setMasterLevel(12); }} style={styles.resetButton}><RotateCcw size={14} color={theme.colors.grisSignal} /><Text style={styles.resetText}>Réinitialiser</Text></Pressable>
            </View>

            <View style={styles.meterHeader}>
              <Text style={styles.columnLabel}>INSTRUMENT</Text>
              <Text style={[styles.columnLabel, styles.gainColumnLabel]}>NIVEAU</Text>
              <Text style={styles.columnLabel}>SOLO · COUPER</Text>
            </View>

            <View style={styles.trackList}>
              {loadedStems.map((stem) => (
                <TrackStrip
                  key={stem.filename}
                  name={stem.label}
                  color={stem.color}
                  level={levels[stem.filename] ?? 7}
                  muted={muted.includes(stem.filename) || (solo !== null && solo !== stem.filename)}
                  solo={solo === stem.filename}
                  compact={compact}
                  onLevelChange={(value) => changeLevel(stem.filename, value)}
                  onToggleMute={() => toggleMute(stem.filename)}
                  onToggleSolo={() => setSolo((current) => current === stem.filename ? null : stem.filename)}
                />
              ))}
            </View>

            <View style={[styles.masterRow, compact && styles.masterCompact]}>
              <View style={styles.masterIdentity}><View style={styles.masterIcon}><Volume2 size={17} color={theme.colors.vertStudio} /></View><View><Text style={styles.masterTitle}>Volume général</Text><Text style={styles.masterSub}>TOUTES LES PISTES</Text></View></View>
              <View style={styles.masterSlider}>
                <Pressable onPress={() => setMasterLevel((value) => Math.max(0, value - 1))} style={styles.masterButton}><Text style={styles.masterButtonText}>−</Text></Pressable>
                <View style={styles.masterSegments}>{Array.from({ length: 12 }, (_, index) => <View key={index} style={[styles.masterSegment, index < masterLevel && styles.masterSegmentActive]} />)}</View>
                <Pressable onPress={() => setMasterLevel((value) => Math.min(12, value + 1))} style={styles.masterButton}><Text style={styles.masterButtonText}>+</Text></Pressable>
              </View>
              <View style={styles.masterOutput}><Headphones size={16} color={theme.colors.grisSignal} /><Text style={styles.masterOutputText}>{masterLevel === 0 ? '−∞ dB' : `${((masterLevel - 12) * 2) > 0 ? '+' : '−'}${String(Math.abs((masterLevel - 12) * 2)).padStart(2, '0')} dB`}</Text></View>
            </View>

            <TransportBar
              isPlaying={playing}
              enabled={loadedStems.length > 0}
              positionMillis={position}
              durationMillis={duration}
              onToggle={() => void togglePlayback()}
              onSeek={(nextPosition) => void seek(nextPosition)}
            />
          </>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.nuitStudio },
  page: { width: '100%', maxWidth: 1180, alignSelf: 'center', paddingHorizontal: 24, paddingBottom: 40 },
  pageCompact: { paddingHorizontal: 12 },
  topbar: { height: 70, borderBottomWidth: 1, borderBottomColor: theme.colors.ligne, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  topbarSpacer: { width: 86 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brandMark: { width: 28, height: 28, borderRadius: 8, backgroundColor: theme.colors.vertStudio, alignItems: 'center', justifyContent: 'center' },
  brandText: { color: theme.colors.blancCasse, fontWeight: '700', fontSize: 11, letterSpacing: 1 },
  brandSub: { color: theme.colors.grisSignal, fontWeight: '400' },
  content: { paddingTop: 34 },
  headingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', gap: 18 },
  headingCompact: { flexDirection: 'column', alignItems: 'flex-start' },
  headingCopy: { flex: 1 },
  eyebrow: { color: theme.colors.vertStudio, fontSize: 10, letterSpacing: 1.5, fontWeight: '700' },
  title: { color: theme.colors.blancCasse, fontFamily: theme.typography.manrope.semiBold, fontSize: 32, lineHeight: 39, fontWeight: '600', letterSpacing: -0.8, marginTop: 7 },
  subtitle: { color: theme.colors.grisSignal, fontSize: 13, lineHeight: 19, marginTop: 6, maxWidth: 630 },
  newTrackButton: { minHeight: 42, borderRadius: 8, backgroundColor: theme.colors.vertStudio, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, paddingHorizontal: 14 },
  newTrackText: { color: theme.colors.nuitStudio, fontSize: 12, fontWeight: '700' },
  mixerToolbar: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 24, borderBottomWidth: 1, borderBottomColor: theme.colors.ligne },
  trackCount: { flexDirection: 'row', gap: 7, alignItems: 'baseline' },
  trackCountNumber: { color: theme.colors.blancCasse, fontSize: 16, fontWeight: '700' },
  trackCountLabel: { color: theme.colors.grisSignal, fontSize: 10, letterSpacing: 0.8 },
  toolbarDivider: { width: 1, height: 19, backgroundColor: theme.colors.ligne },
  mixerMode: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  mixerModeText: { color: theme.colors.grisSignal, fontSize: 10, letterSpacing: 0.6 },
  toolbarSpacer: { flex: 1 },
  resetButton: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 8 },
  resetText: { color: theme.colors.grisSignal, fontSize: 11 },
  meterHeader: { height: 38, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 },
  columnLabel: { color: '#858A7E', fontSize: 9, letterSpacing: 0.9 },
  gainColumnLabel: { flex: 1, textAlign: 'center' },
  trackList: { gap: 8 },
  masterRow: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 14, marginBottom: 16, padding: 12, borderWidth: 1, borderColor: '#45513A', borderRadius: 10, backgroundColor: '#1D2319' },
  masterCompact: { gap: 9, paddingHorizontal: 8 },
  masterIdentity: { flex: 1, minWidth: 125, flexDirection: 'row', alignItems: 'center', gap: 9 },
  masterIcon: { width: 32, height: 32, borderRadius: 8, backgroundColor: '#303A25', alignItems: 'center', justifyContent: 'center' },
  masterTitle: { color: theme.colors.vertStudio, fontSize: 12, fontWeight: '700' },
  masterSub: { color: theme.colors.grisSignal, fontSize: 9, letterSpacing: 0.6, marginTop: 3 },
  masterSlider: { flex: 2, flexDirection: 'row', alignItems: 'center', gap: 8 },
  masterButton: { width: 30, height: 30, borderWidth: 1, borderColor: theme.colors.ligne, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  masterButtonText: { color: theme.colors.blancCasse, fontSize: 19, lineHeight: 22 },
  masterSegments: { flex: 1, height: 20, flexDirection: 'row', alignItems: 'center', gap: 3 },
  masterSegment: { flex: 1, height: 9, borderRadius: 3, backgroundColor: '#383B35' },
  masterSegmentActive: { backgroundColor: theme.colors.vertStudio },
  masterOutput: { minWidth: 83, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 8 },
  masterOutputText: { color: theme.colors.blancCasse, fontSize: 11, fontVariant: ['tabular-nums'] },
  stateCard: { minHeight: 250, marginTop: 28, padding: 28, borderWidth: 1, borderColor: theme.colors.ligne, borderRadius: 13, backgroundColor: theme.colors.console, alignItems: 'center', justifyContent: 'center' },
  stateIcon: { width: 46, height: 46, borderRadius: 14, backgroundColor: '#303A25', alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  stateTitle: { color: theme.colors.blancCasse, fontFamily: theme.typography.manrope.semiBold, fontSize: 17, fontWeight: '600', marginTop: 12, textAlign: 'center' },
  stateText: { color: theme.colors.grisSignal, fontSize: 13, lineHeight: 19, maxWidth: 440, marginTop: 8, textAlign: 'center' },
  stateButton: { marginTop: 19, minHeight: 42, borderRadius: 8, backgroundColor: theme.colors.vertStudio, justifyContent: 'center', paddingHorizontal: 15 },
  stateButtonText: { color: theme.colors.nuitStudio, fontSize: 12, fontWeight: '700' },
});
