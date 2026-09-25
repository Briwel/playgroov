import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { ArrowRight, AudioLines, Check, FileAudio2, Share2, Upload } from 'lucide-react-native';
import axios from 'axios';
import { Link, useLocalSearchParams } from 'expo-router';

import { API_URL } from '../../src/constants/api';
import { BackButton } from '../../src/components/BackButton';
import { theme } from '../../src/theme';

type TrackStatus = 'IMPORTED' | 'SPLITTING' | 'SPLIT' | 'TRANSCRIBING' | 'READY';

const steps = [
  { key: 'import', label: 'Importer', number: '01' },
  { key: 'separate', label: 'Séparer', number: '02' },
  { key: 'transcribe', label: 'Transcrire', number: '03' },
];

export default function ImportScreen() {
  const compact = useWindowDimensions().width < 600;
  const params = useLocalSearchParams<{ trackId?: string | string[] }>();
  const requestedTrackId = Array.isArray(params.trackId) ? params.trackId[0] : params.trackId;
  const [file, setFile] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [sourceName, setSourceName] = useState<string | null>(null);
  const [status, setStatus] = useState<TrackStatus | null>(null);
  const [progress, setProgress] = useState(0);
  const [trackId, setTrackId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connectionWarning, setConnectionWarning] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [midiAvailable, setMidiAvailable] = useState(false);

  useEffect(() => {
    if (!requestedTrackId) return;
    let active = true;
    const restoreTrack = async () => {
      setError(null);
      try {
        const response = await axios.get(`${API_URL}/tracks/${requestedTrackId}`);
        if (!active) return;
        setFile(null);
        setSourceName(response.data.title);
        setTrackId(response.data.id);
        setStatus(response.data.status as TrackStatus);
        setMidiAvailable(Boolean(response.data.midiAvailable));
        setProgress(response.data.status === 'SPLIT' || response.data.status === 'READY' ? 100 : 0);
      } catch (restoreError) {
        console.error('Unable to restore track session', restoreError);
        if (active) setError('Impossible de retrouver ce morceau dans le studio.');
      }
    };
    void restoreTrack();
    return () => { active = false; };
  }, [requestedTrackId]);

  useEffect(() => {
    if (!trackId) return;
    let active = true;
    let keepPolling = true;
    let delay = status === 'SPLITTING' ? 1500 : 2500;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        if (status === 'SPLITTING') {
          const response = await axios.get(`${API_URL}/stem-separation/${trackId}/status`);
          if (!active) return;
          setProgress(Math.max(0, Math.min(100, Number(response.data.progress) || 0)));
          if (response.data.status === 'COMPLETED') {
            setProgress(100);
            setStatus('SPLIT');
            keepPolling = false;
          } else if (response.data.status === 'FAILED') {
            setError(response.data.error ?? 'La séparation des pistes a échoué.');
            setStatus('IMPORTED');
            keepPolling = false;
          }
        } else {
          const response = await axios.get(`${API_URL}/tracks/${trackId}`);
          const nextStatus = response.data.status as TrackStatus;
          if (!active) return;
          setStatus(nextStatus);
          if (nextStatus === 'READY' || nextStatus === 'SPLIT') keepPolling = false;
        }
        setConnectionWarning(null);
      } catch (pollError) {
        if (!active) return;
        console.error('Status check failed', pollError);
        const offline = axios.isAxiosError(pollError) && !pollError.response;
        setConnectionWarning(offline
          ? 'Connexion au backend interrompue. Vérifiez qu’il reste démarré sur le PC ; la vérification reprendra automatiquement.'
          : 'Impossible de lire l’état du traitement. La vérification va réessayer automatiquement.');
        delay = Math.min(delay * 2, 8000);
      } finally {
        if (active && keepPolling) timer = setTimeout(() => void poll(), delay);
      }
    };
    timer = setTimeout(() => void poll(), delay);
    return () => { active = false; keepPolling = false; clearTimeout(timer); };
  }, [trackId, status]);

  const pickFile = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: 'audio/*', copyToCacheDirectory: true });
    if (!result.canceled) {
      setFile(result.assets[0]);
      setSourceName(result.assets[0].name);
      setError(null);
      setStatus(null);
      setProgress(0);
      setTrackId(null);
      setMidiAvailable(false);
    }
  };

  const uploadFile = async () => {
    if (!file || busy) return;
    setBusy(true);
    setError(null);
    setConnectionWarning(null);
    try {
      const formData = new FormData();
      if (Platform.OS === 'web') {
        // On web, FormData needs a real Blob/File. The { uri, name, type } shape
        // is only understood by React Native's native networking layer.
        const browserFile = (file as DocumentPicker.DocumentPickerAsset & { file?: Blob }).file;
        let audioBlob: Blob;
        if (browserFile) {
          audioBlob = browserFile;
        } else {
          const assetResponse = await fetch(file.uri);
          if (!assetResponse.ok) throw new Error('Impossible de lire le fichier audio sélectionné.');
          audioBlob = await assetResponse.blob();
        }
        formData.append('file', audioBlob, file.name);
      } else {
        formData.append('file', {
          uri: file.uri,
          name: file.name,
          type: file.mimeType ?? 'audio/mpeg',
        } as any);
      }
      formData.append('title', file.name.replace(/\.[^/.]+$/, ''));

      // Do not set Content-Type manually: the browser/client must add the
      // multipart boundary used by Nest/Multer to parse the uploaded file.
      const response = await axios.post(`${API_URL}/tracks/import`, formData);
      setTrackId(response.data.id);
      setSourceName(file.name);
      setStatus('IMPORTED');
    } catch (uploadError) {
      console.error('Upload failed', uploadError);
      setError(getUploadErrorMessage(uploadError));
    } finally {
      setBusy(false);
    }
  };

  const runProcessingStep = async (step: 'stem-separation' | 'transcription') => {
    if (!trackId || busy) return;
    setBusy(true);
    setError(null);
    if (step === 'stem-separation') setProgress(0);
    setStatus(step === 'stem-separation' ? 'SPLITTING' : 'TRANSCRIBING');
    try {
      const response = await axios.post(`${API_URL}/${step}/${trackId}`);
      if (step === 'transcription') {
        setStatus('READY');
        setMidiAvailable(Boolean(response.data?.midiAvailable));
      }
    } catch (processingError) {
      console.error(`${step} failed`, processingError);
      const reason = axios.isAxiosError(processingError)
        ? extractApiMessage(processingError.response?.data)
        : null;
      const statusCode = axios.isAxiosError(processingError) ? processingError.response?.status : undefined;
      setError(statusCode === 502
        ? `${step === 'stem-separation' ? 'Le service Demucs ne répond pas. Vérifiez qu’il est démarré sur le PC (port 8000)' : 'La transcription MIDI n’a pas abouti. Vérifiez que Basic Pitch fonctionne sur le port 8001'}${reason ? `. Détail : ${reason}` : '.'}`
        : reason ?? 'Le traitement a échoué. Vérifiez que le service audio est démarré, puis réessayez.');
      setStatus(step === 'stem-separation' ? 'IMPORTED' : 'SPLIT');
    } finally {
      setBusy(false);
    }
  };

  const shareMidi = async () => {
    if (!trackId || busy) return;
    setBusy(true);
    setError(null);
    try {
      const safeBaseName = (sourceName ?? 'transcription').replace(/\.[^/.]+$/, '').replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_');
      const filename = `${safeBaseName || 'transcription'}.mid`;
      const url = `${API_URL}/tracks/${encodeURIComponent(trackId)}/midi`;
      if (Platform.OS === 'web') {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Téléchargement impossible (HTTP ${response.status}).`);
        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = objectUrl;
        anchor.download = filename;
        anchor.click();
        URL.revokeObjectURL(objectUrl);
      } else {
        if (!FileSystem.cacheDirectory) throw new Error('Espace temporaire indisponible sur cet appareil.');
        const download = await FileSystem.downloadAsync(url, `${FileSystem.cacheDirectory}${filename}`);
        if (!await Sharing.isAvailableAsync()) throw new Error('Le partage de fichiers n’est pas disponible sur cet appareil.');
        await Sharing.shareAsync(download.uri, { mimeType: 'audio/midi', dialogTitle: 'Enregistrer ou partager le MIDI', UTI: 'public.midi-audio' });
      }
    } catch (shareError) {
      const reason = axios.isAxiosError(shareError) ? extractApiMessage(shareError.response?.data) : null;
      setError(reason ?? (shareError instanceof Error ? shareError.message : 'Le téléchargement du MIDI a échoué.'));
    } finally {
      setBusy(false);
    }
  };

  const currentStep = !trackId ? 0 : status === 'IMPORTED' || status === 'SPLITTING' ? 1 : status === 'SPLIT' || status === 'TRANSCRIBING' ? 2 : 3;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.page, compact && styles.pageCompact]}>
      <View style={styles.topbar}>
        <BackButton />
        <View style={styles.brand}><View style={styles.brandMark}><AudioLines size={16} color={theme.colors.nuitStudio} /></View><Text style={styles.brandText}>POCKETGROOVE <Text style={styles.brandSub}>/ IMPORT</Text></Text></View>
      </View>

      <View style={[styles.content, compact && styles.contentCompact]}>
        <View style={styles.heading}>
          <Text style={styles.eyebrow}>NOUVELLE SESSION · ÉTAPE {String(Math.min(currentStep + 1, 3)).padStart(2, '0')}</Text>
          <Text style={[styles.title, compact && styles.titleCompact]}>Faites entrer{ '\n' }le morceau.</Text>
          <Text style={styles.description}>Choisissez une source audio. On prépare ensuite chaque élément pour votre session.</Text>
        </View>

        <View style={[styles.stepper, compact && styles.stepperCompact]}>
          {steps.map((step, index) => {
            const complete = currentStep > index;
            const active = currentStep === index;
            return (
              <View key={step.key} style={styles.step}>
                <View style={[styles.stepNumber, complete && styles.stepComplete, active && styles.stepActive]}>
                  {complete ? <Check size={13} color={theme.colors.nuitStudio} /> : <Text style={[styles.stepNumberText, active && styles.stepNumberActive]}>{step.number}</Text>}
                </View>
                <Text style={[styles.stepLabel, compact && styles.stepLabelCompact, active && styles.stepLabelActive]}>{step.label}</Text>
                {index < steps.length - 1 && <View style={[styles.stepLine, compact && styles.stepLineCompact, complete && styles.stepLineComplete]} />}
              </View>
            );
          })}
        </View>

        <View style={[styles.panel, compact && styles.panelCompact]}>
          <View style={styles.panelHeading}>
            <View><Text style={styles.panelTitle}>Votre source audio</Text><Text style={styles.panelHint}>Un fichier à la fois · jusqu’à 100 Mo</Text></View>
            <View style={styles.formatPill}><Text style={styles.formatText}>AUDIO</Text></View>
          </View>

          <Pressable onPress={pickFile} style={({ pressed }) => [styles.dropzone, pressed && styles.dropzonePressed]} accessibilityRole="button">
            <View style={styles.uploadIcon}><Upload size={20} color={theme.colors.vertStudio} /></View>
            <Text style={styles.dropTitle}>{file ? 'Changer de fichier' : 'Choisir un fichier audio'}</Text>
            <Text style={styles.dropHint}>Parcourez votre bibliothèque musicale</Text>
            <View style={styles.formatRow}><Text style={styles.formatSmall}>WAV</Text><Text style={styles.formatSmall}>AIFF</Text><Text style={styles.formatSmall}>MP3</Text><Text style={styles.formatSmall}>M4A</Text></View>
          </Pressable>

          {sourceName && (
            <View style={styles.fileCard}>
              <View style={styles.fileIcon}><FileAudio2 size={20} color={theme.colors.vertStudio} /></View>
              <View style={styles.fileInfo}><Text numberOfLines={1} style={styles.fileName}>{sourceName}</Text><Text style={styles.fileMeta}>{file?.size ? `${(file.size / 1024 / 1024).toFixed(1)} Mo · Prêt à importer` : 'Déjà dans votre studio · Réutilisable'}</Text></View>
              <View style={styles.readyDot} />
            </View>
          )}

          {status && (
            <View style={styles.statusCard}>
              {busy || status === 'SPLITTING' ? <ActivityIndicator size="small" color={theme.colors.vertStudio} /> : <View style={styles.statusDot} />}
              <View style={styles.fileInfo}>
                <Text style={styles.statusTitle}>{statusLabel(status)}</Text>
                <Text style={styles.fileMeta}>{statusDetail(status)}</Text>
                {status === 'SPLITTING' && <View style={styles.progressWrap}>
                  <View style={styles.progressMeta}><Text style={styles.progressLabel}>Séparation en cours</Text><Text style={styles.progressPercent}>{progress}%</Text></View>
                  <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${progress}%` }]} /></View>
                </View>}
              </View>
              {status === 'READY' && <Check size={18} color={theme.colors.state.succes} />}
            </View>
          )}

          {(error || connectionWarning) && <View style={styles.errorBox}><Text style={styles.errorText}>{error ?? connectionWarning}</Text></View>}

          {!trackId && <Pressable onPress={uploadFile} disabled={!file || busy} style={({ pressed }) => [styles.actionButton, (!file || busy) && styles.actionDisabled, pressed && file && styles.actionPressed]}>
            {busy ? <ActivityIndicator color={theme.colors.nuitStudio} /> : <><Text style={styles.actionText}>Importer dans le studio</Text><ArrowRight size={17} color={theme.colors.nuitStudio} /></>}
          </Pressable>}
          {trackId && status === 'IMPORTED' && <ActionButton label="Isoler les pistes" detail="Séparation instrumentale" icon={<AudioLines size={17} color={theme.colors.nuitStudio} />} busy={busy} onPress={() => runProcessingStep('stem-separation')} />}
          {trackId && (status === 'SPLIT' || (status === 'READY' && !midiAvailable)) && <ActionButton label="Créer une transcription MIDI" detail="Transformer l’audio en notes" icon={<ArrowRight size={17} color={theme.colors.nuitStudio} />} busy={busy} onPress={() => runProcessingStep('transcription')} />}
          {trackId && status === 'READY' && midiAvailable && <ActionButton label="Partager le fichier MIDI" detail="Enregistrer ou envoyer la transcription" icon={<Share2 size={17} color={theme.colors.nuitStudio} />} busy={busy} onPress={shareMidi} />}
          {(status === 'SPLIT' || status === 'READY') && <Link href={{ pathname: '/stems', params: { trackId } }} asChild><Pressable style={styles.doneLink} accessibilityRole="button"><Text style={styles.doneText}>Écouter les pistes</Text></Pressable></Link>}
        </View>

        <View style={styles.privacy}><View style={styles.privacyMark}><Check size={12} color={theme.colors.vertStudio} /></View><Text style={styles.privacyText}>Vos fichiers restent associés à votre session studio.</Text></View>
      </View>
    </ScrollView>
  );
}

function extractApiMessage(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(extractApiMessage).filter(Boolean).join(', ') || null;
  if (typeof value === 'object' && value !== null && 'message' in value) {
    return extractApiMessage(value.message);
  }
  return null;
}

function getUploadErrorMessage(error: unknown) {
  if (axios.isAxiosError(error)) {
    const message = extractApiMessage(error.response?.data);

    if (error.response) {
      return message
        ? `L’API a refusé l’import (${error.response.status}) : ${message}`
        : `L’API a répondu avec une erreur ${error.response.status}.`;
    }

    return `Impossible de joindre l’API (${API_URL}). Vérifiez que le serveur est démarré et que cette adresse est accessible depuis votre appareil.`;
  }

  return error instanceof Error ? error.message : 'Une erreur inattendue a empêché l’import du fichier.';
}

function ActionButton({ label, detail, icon, busy, onPress }: { label: string; detail: string; icon: React.ReactNode; busy: boolean; onPress: () => void }) {
  return <Pressable onPress={onPress} disabled={busy} style={({ pressed }) => [styles.actionButton, pressed && styles.actionPressed]}>{busy ? <ActivityIndicator color={theme.colors.nuitStudio} /> : <>{icon}<View style={styles.actionCopy}><Text style={styles.actionText}>{label}</Text><Text style={styles.actionDetail}>{detail}</Text></View><ArrowRight size={17} color={theme.colors.nuitStudio} /></>}</Pressable>;
}

function statusLabel(status: TrackStatus) {
  return ({ IMPORTED: 'Morceau importé', SPLITTING: 'Séparation en cours', SPLIT: 'Pistes isolées', TRANSCRIBING: 'Transcription en cours', READY: 'Session prête' })[status];
}

function statusDetail(status: TrackStatus) {
  return ({ IMPORTED: 'Votre source est prête pour le traitement.', SPLITTING: 'Demucs isole les différentes pistes audio.', SPLIT: 'Vous pouvez passer à la transcription MIDI.', TRANSCRIBING: 'Les notes sont en cours d’extraction.', READY: 'Vous pouvez ouvrir le mixeur.' })[status];
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.nuitStudio },
  page: { width: '100%', maxWidth: 1040, alignSelf: 'center', paddingHorizontal: 24, paddingBottom: 48 },
  pageCompact: { paddingHorizontal: 16, paddingBottom: 32 },
  topbar: { height: 68, borderBottomWidth: 1, borderBottomColor: theme.colors.ligne, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backLink: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  backText: { color: theme.colors.grisSignal, fontSize: 12 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brandMark: { width: 26, height: 26, borderRadius: 8, backgroundColor: theme.colors.vertStudio, alignItems: 'center', justifyContent: 'center' },
  brandText: { color: theme.colors.blancCasse, fontWeight: '700', fontSize: 10, letterSpacing: 1.1 },
  brandSub: { color: theme.colors.grisSignal, fontWeight: '400' },
  content: { width: '100%', maxWidth: 620, alignSelf: 'center', paddingTop: 50 },
  contentCompact: { paddingTop: 28 },
  heading: { alignItems: 'center' },
  eyebrow: { color: theme.colors.vertStudio, fontSize: 10, letterSpacing: 1.6, fontWeight: '700' },
  title: { color: theme.colors.blancCasse, fontFamily: theme.typography.manrope.semiBold, fontSize: 42, lineHeight: 47, fontWeight: '600', letterSpacing: -1.7, textAlign: 'center', marginTop: 12 },
  titleCompact: { fontSize: 34, lineHeight: 39, letterSpacing: -1.2 },
  description: { color: theme.colors.grisSignal, fontFamily: theme.typography.manrope.regular, fontSize: 13, lineHeight: 20, textAlign: 'center', maxWidth: 390, marginTop: 12 },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 28, marginBottom: 24 },
  stepperCompact: { marginTop: 22, marginBottom: 18 },
  step: { flexDirection: 'row', alignItems: 'center' },
  stepNumber: { width: 26, height: 26, borderRadius: 13, borderWidth: 1, borderColor: theme.colors.ligne, alignItems: 'center', justifyContent: 'center' },
  stepActive: { borderColor: theme.colors.vertStudio },
  stepComplete: { backgroundColor: theme.colors.vertStudio, borderColor: theme.colors.vertStudio },
  stepNumberText: { color: theme.colors.grisSignal, fontSize: 8, fontWeight: '700' },
  stepNumberActive: { color: theme.colors.vertStudio },
  stepLabel: { color: theme.colors.grisSignal, fontSize: 11, marginLeft: 7 },
  stepLabelCompact: { fontSize: 10, marginLeft: 5 },
  stepLabelActive: { color: theme.colors.blancCasse },
  stepLine: { height: 1, width: 32, backgroundColor: theme.colors.ligne, marginHorizontal: 11 },
  stepLineCompact: { width: 12, marginHorizontal: 5 },
  stepLineComplete: { backgroundColor: theme.colors.vertStudio },
  panel: { padding: 20, borderWidth: 1, borderColor: theme.colors.ligne, borderRadius: 14, backgroundColor: theme.colors.console },
  panelCompact: { padding: 14, borderRadius: 12 },
  panelHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 15 },
  panelTitle: { color: theme.colors.blancCasse, fontFamily: theme.typography.manrope.semiBold, fontWeight: '600', fontSize: 14 },
  panelHint: { color: theme.colors.grisSignal, fontSize: 11, marginTop: 4 },
  formatPill: { borderWidth: 1, borderColor: theme.colors.ligne, borderRadius: 99, paddingHorizontal: 9, paddingVertical: 5 },
  formatText: { color: theme.colors.grisSignal, fontSize: 8, letterSpacing: 1.1 },
  dropzone: { minHeight: 168, borderWidth: 1, borderStyle: 'dashed', borderColor: '#4A5141', borderRadius: 11, backgroundColor: '#1D211A', alignItems: 'center', justifyContent: 'center', padding: 18 },
  dropzonePressed: { borderColor: theme.colors.vertStudio, backgroundColor: '#22291A' },
  uploadIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: '#303A25', alignItems: 'center', justifyContent: 'center' },
  dropTitle: { color: theme.colors.blancCasse, fontFamily: theme.typography.manrope.semiBold, fontSize: 14, fontWeight: '600', marginTop: 11 },
  dropHint: { color: theme.colors.grisSignal, fontSize: 11, marginTop: 4 },
  formatRow: { flexDirection: 'row', gap: 6, marginTop: 13 },
  formatSmall: { color: theme.colors.grisSignal, fontSize: 9, letterSpacing: 0.6, borderWidth: 1, borderColor: theme.colors.ligne, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 4 },
  fileCard: { flexDirection: 'row', alignItems: 'center', gap: 11, marginTop: 12, borderWidth: 1, borderColor: theme.colors.ligne, borderRadius: 9, padding: 12, backgroundColor: theme.colors.nuitStudio },
  fileIcon: { width: 34, height: 34, borderRadius: 8, backgroundColor: '#303A25', alignItems: 'center', justifyContent: 'center' },
  fileInfo: { flex: 1 },
  fileName: { color: theme.colors.blancCasse, fontFamily: theme.typography.manrope.semiBold, fontSize: 11, fontWeight: '600' },
  fileMeta: { color: theme.colors.grisSignal, fontSize: 10, marginTop: 4 },
  readyDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: theme.colors.state.succes },
  statusCard: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12, padding: 12, borderRadius: 8, backgroundColor: '#20251B' },
  statusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: theme.colors.vertStudio },
  statusTitle: { color: theme.colors.blancCasse, fontSize: 11, fontWeight: '600' },
  progressWrap: { marginTop: 12 },
  progressMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 7 },
  progressLabel: { color: theme.colors.grisSignal, fontSize: 10 },
  progressPercent: { color: theme.colors.vertStudio, fontSize: 11, fontWeight: '700', fontVariant: ['tabular-nums'] },
  progressTrack: { height: 6, width: '100%', overflow: 'hidden', borderRadius: 99, backgroundColor: '#30352C' },
  progressFill: { height: '100%', borderRadius: 99, backgroundColor: theme.colors.vertStudio },
  errorBox: { marginTop: 12, borderRadius: 8, borderWidth: 1, borderColor: '#633C37', backgroundColor: '#2A1D1A', padding: 11 },
  errorText: { color: '#F0A198', fontSize: 10, lineHeight: 15 },
  actionButton: { minHeight: 48, marginTop: 16, borderRadius: 8, backgroundColor: theme.colors.vertStudio, paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  actionDisabled: { opacity: 0.45 },
  actionPressed: { opacity: 0.8 },
  actionCopy: { flex: 1 },
  actionText: { color: theme.colors.nuitStudio, fontSize: 12, fontWeight: '700' },
  actionDetail: { color: '#424D33', fontSize: 10, marginTop: 2 },
  doneLink: { minHeight: 42, width: 190, marginTop: 15, alignSelf: 'center', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, paddingVertical: 9, borderRadius: 9, backgroundColor: theme.colors.vertStudio },
  doneText: { width: '100%', color: theme.colors.nuitStudio, fontFamily: theme.typography.manrope.semiBold, fontSize: 13, fontWeight: '700', textAlign: 'center' },
  privacy: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 17 },
  privacyMark: { width: 19, height: 19, borderRadius: 10, backgroundColor: '#283022', alignItems: 'center', justifyContent: 'center' },
  privacyText: { color: theme.colors.grisSignal, fontSize: 10 },
});
