import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { AudioLines, Check, ChevronRight, Clock3, History, RefreshCw, Search, Trash2, X } from 'lucide-react-native';
import { Link, router, type Href } from 'expo-router';
import axios from 'axios';

import { BackButton } from '../../src/components/BackButton';
import { API_URL } from '../../src/constants/api';
import { theme } from '../../src/theme';

type Track = {
  id: string;
  title: string;
  artist?: string | null;
  status: 'IMPORTED' | 'SPLITTING' | 'SPLIT' | 'TRANSCRIBING' | 'READY';
  createdAt: string;
  updatedAt: string;
  stems: Array<{ filename: string; name: string; taskId: string }>;
};

const statusCopy: Record<Track['status'], string> = {
  IMPORTED: 'Source importée',
  SPLITTING: 'Séparation en cours',
  SPLIT: 'Pistes isolées',
  TRANSCRIBING: 'Transcription en cours',
  READY: 'Session prête',
};

export default function HistoryScreen() {
  const compact = useWindowDimensions().width < 700;
  const [tracks, setTracks] = useState<Track[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Track | null>(null);
  const [deletingTrackId, setDeletingTrackId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const loadHistory = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const response = await axios.get<Track[]>(`${API_URL}/tracks`);
      setTracks(response.data);
    } catch (loadError) {
      console.error('Unable to load track history', loadError);
      setError('Impossible de charger vos morceaux. Vérifiez la connexion au studio puis réessayez.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const deleteTrack = async (track: Track) => {
    setDeletingTrackId(track.id);
    setDeleteError(null);
    try {
      await axios.delete(`${API_URL}/tracks/${track.id}`);
      setTracks((current) => current.filter((item) => item.id !== track.id));
      setDeleteTarget(null);
    } catch (deleteFailure) {
      console.error('Unable to delete track', deleteFailure);
      const message = axios.isAxiosError(deleteFailure) ? deleteFailure.response?.data?.message : null;
      setDeleteError(typeof message === 'string' ? message : 'Impossible de supprimer ce morceau. Réessayez.');
    } finally {
      setDeletingTrackId(null);
    }
  };

  useEffect(() => { void loadHistory(); }, [loadHistory]);

  const filteredTracks = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('fr');
    if (!normalizedQuery) return tracks;
    return tracks.filter((track) => `${track.title} ${track.artist ?? ''}`.toLocaleLowerCase('fr').includes(normalizedQuery));
  }, [query, tracks]);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.page, compact && styles.pageCompact]}>
      <View style={styles.topbar}>
        <BackButton />
        <View style={styles.brand}>
          <View style={styles.brandMark}><AudioLines size={15} color={theme.colors.nuitStudio} /></View>
          <Text style={styles.brandText}>POCKETGROOVE <Text style={styles.brandSub}>/ ARCHIVES</Text></Text>
        </View>
      </View>

      <View style={styles.content}>
        <View style={styles.headingRow}>
          <View style={styles.headingCopy}>
            <Text style={styles.eyebrow}>VOTRE BIBLIOTHÈQUE DE STUDIO</Text>
            <Text style={styles.title}>Vos morceaux.</Text>
            <Text style={styles.description}>Retrouvez vos sources et reprenez chaque session là où vous l’avez laissée.</Text>
          </View>
          <Pressable onPress={() => void loadHistory(true)} disabled={refreshing} style={styles.refreshButton} accessibilityRole="button" accessibilityLabel="Actualiser l’historique">
            {refreshing ? <ActivityIndicator size="small" color={theme.colors.vertStudio} /> : <RefreshCw size={17} color={theme.colors.vertStudio} />}
          </Pressable>
        </View>

        <View style={[styles.libraryBar, compact && styles.libraryBarCompact]}>
          <View style={styles.countGroup}>
            <History size={17} color={theme.colors.vertStudio} />
            <Text style={styles.countText}>{tracks.length} {tracks.length > 1 ? 'morceaux' : 'morceau'} dans le studio</Text>
          </View>
          <View style={[styles.searchBox, compact && styles.searchBoxCompact]}>
            <Search size={15} color={theme.colors.grisSignal} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Rechercher un morceau"
              placeholderTextColor={theme.colors.grisSignal}
              style={styles.searchInput}
              accessibilityLabel="Rechercher dans les morceaux"
            />
          </View>
        </View>

        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable onPress={() => void loadHistory()} style={styles.retryButton}><Text style={styles.retryText}>Réessayer</Text></Pressable>
          </View>
        )}

        {loading ? (
          <View style={styles.loadingState}><ActivityIndicator size="large" color={theme.colors.vertStudio} /><Text style={styles.loadingText}>Chargement de vos sessions…</Text></View>
        ) : filteredTracks.length > 0 ? (
          <View style={styles.trackList}>
            {filteredTracks.map((track) => {
              const hasStems = track.stems?.length > 0;
              const href = (hasStems
                ? { pathname: '/stems', params: { trackId: track.id } }
                : { pathname: '/import', params: { trackId: track.id } }) as Href;
              return (
                <View key={track.id} style={styles.trackEntry}>
                  <Pressable
                    onPress={() => router.push(href)}
                    style={({ pressed }) => [styles.trackCard, compact && styles.trackCardCompact, pressed && styles.trackCardPressed]}
                    accessibilityRole="button"
                    accessibilityLabel={`${hasStems ? 'Ouvrir' : 'Reprendre'} ${track.title}`}
                  >
                    <View style={[styles.trackIcon, hasStems && styles.trackIconReady]}>
                      <AudioLines size={20} color={hasStems ? theme.colors.vertStudio : theme.colors.grisSignal} />
                    </View>
                    <View style={styles.trackInfo}>
                      <Text numberOfLines={1} style={styles.trackTitle}>{track.title}</Text>
                      <View style={styles.trackMeta}>
                        <Clock3 size={12} color={theme.colors.grisSignal} />
                        <Text style={styles.trackMetaText}>{formatDate(track.updatedAt)}</Text>
                        {track.artist ? <Text numberOfLines={1} style={styles.trackArtist}>· {track.artist}</Text> : null}
                      </View>
                    </View>
                    <View style={[styles.trackState, compact && styles.trackStateCompact]}>
                      <View style={[styles.stateDot, hasStems && styles.stateDotReady, track.status === 'SPLITTING' && styles.stateDotWorking]} />
                      <Text style={[styles.stateText, hasStems && styles.stateTextReady]}>{hasStems ? `${track.stems.length} pistes` : statusCopy[track.status]}</Text>
                    </View>
                    <View style={styles.openAction}>
                      <Text style={styles.openText}>{hasStems ? 'Ouvrir' : 'Reprendre'}</Text>
                      <ChevronRight size={16} color={theme.colors.vertStudio} />
                    </View>
                  </Pressable>
                  <Pressable
                    onPress={() => { setDeleteError(null); setDeleteTarget(track); }}
                    disabled={deletingTrackId === track.id}
                    style={({ pressed }) => [styles.deleteButton, pressed && styles.deleteButtonPressed]}
                    accessibilityRole="button"
                    accessibilityLabel={`Supprimer ${track.title} de l’historique`}
                  >
                    {deletingTrackId === track.id ? <ActivityIndicator size="small" color={theme.colors.state.erreur} /> : <Trash2 size={17} color={theme.colors.grisSignal} />}
                  </Pressable>
                  {deleteTarget?.id === track.id && <View style={styles.confirmBox}>
                    <View style={styles.confirmCopy}>
                      <Text style={styles.confirmTitle}>Supprimer ce morceau ?</Text>
                      <Text style={styles.confirmText}>La source audio et les pistes associées seront effacées du studio.</Text>
                      {deleteError && <Text style={styles.deleteErrorText}>{deleteError}</Text>}
                    </View>
                    <View style={styles.confirmActions}>
                      <Pressable onPress={() => { setDeleteTarget(null); setDeleteError(null); }} style={styles.cancelDeleteButton} accessibilityRole="button">
                        <X size={14} color={theme.colors.grisSignal} /><Text style={styles.cancelDeleteText}>Annuler</Text>
                      </Pressable>
                      <Pressable onPress={() => void deleteTrack(track)} disabled={deletingTrackId === track.id} style={styles.confirmDeleteButton} accessibilityRole="button">
                        {deletingTrackId === track.id ? <ActivityIndicator size="small" color="#FFF" /> : <><Check size={14} color="#FFF" /><Text style={styles.confirmDeleteText}>Supprimer</Text></>}
                      </Pressable>
                    </View>
                  </View>}
                </View>
              );
            })}
          </View>
        ) : (
          <View style={styles.emptyState}>
            <View style={styles.emptyIcon}><AudioLines size={23} color={theme.colors.vertStudio} /></View>
            <Text style={styles.emptyTitle}>{query ? 'Aucun résultat' : 'Votre studio vous attend.'}</Text>
            <Text style={styles.emptyDescription}>{query ? 'Essayez un autre titre ou nom d’artiste.' : 'Les morceaux que vous importez apparaîtront ici. Vous pourrez les rouvrir et reprendre leur traitement à tout moment.'}</Text>
            {!query && <Link href="/import" asChild><Pressable style={styles.newTrackButton}><Text style={styles.newTrackText}>Importer un morceau</Text><ChevronRight size={17} color={theme.colors.nuitStudio} /></Pressable></Link>}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.nuitStudio },
  page: { width: '100%', maxWidth: 1040, alignSelf: 'center', paddingHorizontal: 28, paddingBottom: 48 },
  pageCompact: { paddingHorizontal: 18 },
  topbar: { height: 68, borderBottomWidth: 1, borderBottomColor: theme.colors.ligne, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brandMark: { width: 26, height: 26, borderRadius: 8, backgroundColor: theme.colors.vertStudio, alignItems: 'center', justifyContent: 'center' },
  brandText: { color: theme.colors.blancCasse, fontWeight: '700', fontSize: 10, letterSpacing: 1.1 },
  brandSub: { color: theme.colors.grisSignal, fontWeight: '400' },
  content: { width: '100%', maxWidth: 780, alignSelf: 'center', paddingTop: 54 },
  headingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16 },
  headingCopy: { flex: 1 },
  eyebrow: { color: theme.colors.vertStudio, fontSize: 10, letterSpacing: 1.7, fontWeight: '700' },
  title: { color: theme.colors.blancCasse, fontFamily: theme.typography.manrope.semiBold, fontSize: 38, lineHeight: 45, fontWeight: '600', letterSpacing: -1.2, marginTop: 10 },
  description: { color: theme.colors.grisSignal, fontFamily: theme.typography.manrope.regular, fontSize: 14, lineHeight: 21, maxWidth: 520, marginTop: 9 },
  refreshButton: { width: 42, height: 42, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.ligne, backgroundColor: theme.colors.console, alignItems: 'center', justifyContent: 'center' },
  libraryBar: { marginTop: 32, marginBottom: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 14 },
  libraryBarCompact: { alignItems: 'stretch', flexDirection: 'column' },
  countGroup: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  countText: { color: theme.colors.blancCasse, fontSize: 13, fontWeight: '600' },
  searchBox: { width: 260, height: 40, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 12, borderWidth: 1, borderColor: theme.colors.ligne, borderRadius: 8, backgroundColor: theme.colors.console },
  searchBoxCompact: { width: '100%' },
  searchInput: { flex: 1, padding: 0, color: theme.colors.blancCasse, fontSize: 12 },
  trackList: { gap: 9 },
  trackEntry: { width: '100%', flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  trackCard: { flex: 1, minHeight: 82, flexDirection: 'row', alignItems: 'center', gap: 15, paddingHorizontal: 16, paddingVertical: 13, borderWidth: 1, borderColor: theme.colors.ligne, borderRadius: 12, backgroundColor: theme.colors.console },
  trackCardCompact: { minHeight: 76, gap: 10, paddingHorizontal: 11, paddingVertical: 11, flexWrap: 'wrap' },
  trackCardPressed: { borderColor: '#596544', backgroundColor: '#1E211B' },
  trackIcon: { width: 48, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#252923' },
  trackIconReady: { backgroundColor: '#303A25' },
  trackInfo: { flex: 1, minWidth: 0 },
  trackTitle: { color: theme.colors.blancCasse, fontFamily: theme.typography.manrope.semiBold, fontSize: 14, fontWeight: '600' },
  trackMeta: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6 },
  trackMetaText: { color: theme.colors.grisSignal, fontSize: 11 },
  trackArtist: { maxWidth: 150, color: theme.colors.grisSignal, fontSize: 11 },
  trackState: { minWidth: 110, flexDirection: 'row', alignItems: 'center', gap: 7 },
  trackStateCompact: { minWidth: 0, marginLeft: 58 },
  stateDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: theme.colors.grisSignal },
  stateDotReady: { backgroundColor: theme.colors.vertStudio },
  stateDotWorking: { backgroundColor: theme.colors.ambre },
  stateText: { color: theme.colors.grisSignal, fontSize: 11 },
  stateTextReady: { color: theme.colors.vertStudio },
  openAction: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 11, borderWidth: 1, borderColor: theme.colors.ligne, borderRadius: 8, backgroundColor: '#20231D' },
  openText: { color: theme.colors.blancCasse, fontSize: 12, fontWeight: '600' },
  deleteButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: theme.colors.ligne, borderRadius: 10, backgroundColor: theme.colors.console },
  deleteButtonPressed: { borderColor: '#633C37', backgroundColor: '#2A1D1A' },
  confirmBox: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: 15, borderWidth: 1, borderColor: '#633C37', borderRadius: 10, backgroundColor: '#241C19' },
  confirmCopy: { flex: 1 },
  confirmTitle: { color: theme.colors.blancCasse, fontSize: 13, fontWeight: '700' },
  confirmText: { marginTop: 4, color: theme.colors.grisSignal, fontSize: 11, lineHeight: 16 },
  deleteErrorText: { marginTop: 6, color: '#F0A198', fontSize: 11 },
  confirmActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cancelDeleteButton: { minHeight: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: 10, borderWidth: 1, borderColor: theme.colors.ligne, borderRadius: 7 },
  cancelDeleteText: { color: theme.colors.grisSignal, fontSize: 11, fontWeight: '600' },
  confirmDeleteButton: { minHeight: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: 11, borderRadius: 7, backgroundColor: '#A9463E' },
  confirmDeleteText: { color: '#FFF', fontSize: 11, fontWeight: '700' },
  loadingState: { minHeight: 220, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { color: theme.colors.grisSignal, fontSize: 13 },
  errorBox: { marginTop: 12, padding: 14, borderWidth: 1, borderColor: '#633C37', borderRadius: 9, backgroundColor: '#2A1D1A' },
  errorText: { color: '#F0A198', fontSize: 12, lineHeight: 18 },
  retryButton: { alignSelf: 'flex-start', marginTop: 10, paddingVertical: 5 },
  retryText: { color: theme.colors.vertStudio, fontSize: 12, fontWeight: '600' },
  emptyState: { marginTop: 18, padding: 34, minHeight: 260, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: theme.colors.ligne, borderRadius: 13, backgroundColor: theme.colors.console },
  emptyIcon: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: '#303A25' },
  emptyTitle: { marginTop: 16, color: theme.colors.blancCasse, fontSize: 18, fontWeight: '600', textAlign: 'center' },
  emptyDescription: { maxWidth: 420, marginTop: 8, color: theme.colors.grisSignal, fontSize: 13, lineHeight: 20, textAlign: 'center' },
  newTrackButton: { minHeight: 43, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 20, paddingHorizontal: 15, borderRadius: 8, backgroundColor: theme.colors.vertStudio },
  newTrackText: { color: theme.colors.nuitStudio, fontSize: 12, fontWeight: '700' },
});
