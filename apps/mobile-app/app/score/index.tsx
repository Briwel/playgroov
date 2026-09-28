import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { AudioLines, BookOpen, ChevronLeft, ChevronRight, Download, Music2 } from 'lucide-react-native';
import axios from 'axios';
import { Midi } from '@tonejs/midi';

import { BackButton } from '../../src/components/BackButton';
import { ScoreView } from '../../src/components/ScoreView';
import { API_URL } from '../../src/constants/api';
import { theme } from '../../src/theme';

const instrumentLabels: Record<string, string> = {
  vocals: 'Voix', drums: 'Batterie', bass: 'Basse', guitar: 'Guitare', piano: 'Piano', other: 'Autres instruments',
};

const instrumentColors: Record<string, string> = {
  vocals: theme.colors.stems.voix,
  drums: theme.colors.stems.batterie,
  bass: theme.colors.stems.basse,
  guitar: theme.colors.stems.guitare,
  piano: theme.colors.stems.piano,
  other: theme.colors.stems.autres,
};

type NoteEvent = { keys: string[]; duration: string; midiNote: number };
type MeasureData = { notes: NoteEvent[] };

// Convert a MIDI note number to VexFlow pitch notation (e.g. 60 -> "c/4")
function midiNoteToVex(midi: number): string {
  const names = ['c', 'c#', 'd', 'd#', 'e', 'f', 'f#', 'g', 'g#', 'a', 'a#', 'b'];
  const octave = Math.floor(midi / 12) - 1;
  const name = names[midi % 12];
  return `${name}/${Math.max(0, octave)}`;
}

// Range constraints per instrument to eliminate ghost octave harmonics
const INSTRUMENT_RANGES: Record<string, { min: number; max: number }> = {
  bass: { min: 28, max: 58 },
  vocals: { min: 48, max: 80 },
  guitar: { min: 40, max: 76 },
  piano: { min: 40, max: 84 },
  drums: { min: 48, max: 72 },
  other: { min: 45, max: 80 },
};

function normalizePitch(midi: number, stemName: string): number {
  const range = INSTRUMENT_RANGES[stemName] ?? { min: 36, max: 76 };
  let pitch = midi;
  while (pitch > range.max) pitch -= 12;
  while (pitch < range.min) pitch += 12;
  return pitch;
}

// Parse MIDI binary into cleanly quantized 4/4 measures with exact musical rhythm
function parseMidiToMeasures(
  midi: Midi,
  stemName = 'other',
  clef: 'treble' | 'bass' = 'treble',
  trackIndex = 0,
): { measures: MeasureData[]; bpm: number; trackName: string } {
  const bpm = midi.header.tempos[0]?.bpm ?? 120;
  const midiTrack = midi.tracks[trackIndex] ?? midi.tracks[0];
  const trackName = midiTrack?.name || '';
  const restKey = clef === 'bass' ? 'd/3' : 'b/4';

  if (!midiTrack?.notes?.length) return { measures: [], bpm, trackName };

  const secPerBeat = 60 / bpm;
  const secPerMeasure = secPerBeat * 4; // 4/4 measure duration in seconds
  const STEPS = 8; // 8 slots per 4/4 bar (eighth-note resolution)
  const secPerStep = secPerMeasure / STEPS;

  // 1. Filter micro-clicks and fold ghost harmonics into instrument range
  const sortedNotes = [...midiTrack.notes].sort((a, b) => a.time - b.time);
  const cleaned: Array<{ time: number; duration: number; midi: number }> = [];

  for (const n of sortedNotes) {
    if (n.duration < 0.08) continue; // Ignore noise clicks
    const pitch = normalizePitch(n.midi, stemName);

    const prev = cleaned[cleaned.length - 1];
    // If a note starts almost at the same time (< 120ms):
    if (prev && Math.abs(n.time - prev.time) < 0.12) {
      if (stemName === 'bass' || stemName === 'vocals') {
        if (pitch < prev.midi) prev.midi = pitch;
        continue;
      }
    }
    if (prev && prev.time + prev.duration > n.time) {
      prev.duration = Math.max(0.12, n.time - prev.time);
    }
    cleaned.push({ time: n.time, duration: n.duration, midi: pitch });
  }

  if (!cleaned.length) return { measures: [], bpm, trackName };

  const maxTime = Math.max(...cleaned.map((n) => n.time + n.duration));
  const numMeasures = Math.max(1, Math.ceil(maxTime / secPerMeasure));

  // Convert 8 discrete slots into standard musical note and rest durations (exactly 8 steps = 4 beats)
  function slotsToEvents(slots: Array<number[] | null>): NoteEvent[] {
    const events: NoteEvent[] = [];
    let i = 0;
    while (i < 8) {
      const cur = slots[i];
      let len = 1;
      while (i + len < 8) {
        const next = slots[i + len];
        if (cur === null && next === null) {
          len++;
        } else if (
          cur !== null &&
          next !== null &&
          cur.length === next.length &&
          cur.every((v, idx) => v === next[idx])
        ) {
          len++;
        } else {
          break;
        }
      }

      let remaining = len;
      while (remaining > 0) {
        let chunk = 1;
        let dur = '8';
        if (remaining >= 8) { chunk = 8; dur = 'w'; }
        else if (remaining >= 6) { chunk = 6; dur = 'hd'; }
        else if (remaining >= 4) { chunk = 4; dur = 'h'; }
        else if (remaining >= 3) { chunk = 3; dur = 'qd'; }
        else if (remaining >= 2) { chunk = 2; dur = 'q'; }
        else { chunk = 1; dur = '8'; }

        if (cur === null) {
          events.push({ keys: [restKey], duration: dur + 'r', midiNote: -1 });
        } else {
          const sorted = [...cur].sort((a, b) => a - b);
          events.push({ keys: sorted.map(midiNoteToVex), duration: dur, midiNote: sorted[0] });
        }
        remaining -= chunk;
      }
      i += len;
    }
    return events;
  }

  const measures: MeasureData[] = [];
  for (let m = 0; m < numMeasures; m++) {
    const mStart = m * secPerMeasure;
    const slots: Array<number[] | null> = Array(8).fill(null);

    for (const n of cleaned) {
      if (n.time + n.duration < mStart || n.time >= mStart + secPerMeasure) continue;
      const startStep = Math.max(0, Math.min(7, Math.round((n.time - mStart) / secPerStep)));
      const endStep = Math.max(startStep + 1, Math.min(8, Math.round((n.time + n.duration - mStart) / secPerStep)));
      for (let s = startStep; s < endStep; s++) {
        if (!slots[s]) {
          slots[s] = [n.midi];
        } else if (!slots[s]!.includes(n.midi) && slots[s]!.length < 3) {
          if (stemName !== 'bass' && stemName !== 'vocals') {
            slots[s]!.push(n.midi);
          }
        }
      }
    }

    measures.push({ notes: slotsToEvents(slots) });
  }

  return { measures, bpm, trackName };
}

function buildVexFlowHtml(
  measures: MeasureData[],
  stemName: string,
  color: string,
  bpm: number,
  pageWidth: number,
  clef: 'treble' | 'bass' = 'treble',
  startMeasureOffset: number = 0,
): string {
  const measuresJson = JSON.stringify(measures);
  const safeColor = color.replace(/'/g, '');
  const accentColor = safeColor || '#C3F36B';
  const restKey = clef === 'bass' ? 'd/3' : 'b/4';

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0" />
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body {
    background: #10110F;
    color: #F4F1E8;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    user-select: none;
    overflow-x: auto;
  }
  #header {
    padding: 14px 20px 10px;
    border-bottom: 1px solid #282C24;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .left-meta { display: flex; align-items: center; gap: 10px; }
  #dot { width: 10px; height: 10px; border-radius: 50%; background: ${safeColor}; flex-shrink: 0; }
  #title { color: #F4F1E8; font-size: 13px; font-weight: 700; letter-spacing: 0.5px; }
  #bpm { color: #999D8F; font-size: 11px; margin-top: 2px; }
  .clef-badge {
    background: #1B1E19;
    border: 1px solid #30342D;
    color: #999D8F;
    font-size: 11px;
    padding: 4px 10px;
    border-radius: 6px;
    font-weight: 600;
  }
  #score {
    padding: 16px 12px 32px;
    display: flex;
    justify-content: center;
  }
  svg { display: block; margin: 0 auto; }
  #error { color: #E4776E; padding: 32px; font-size: 13px; text-align: center; }
  #loading { color: #999D8F; padding: 32px; font-size: 13px; text-align: center; }
  #empty { color: #999D8F; padding: 48px 24px; font-size: 13px; text-align: center; }
</style>
</head>
<body>
<div id="header">
  <div class="left-meta">
    <div id="dot"></div>
    <div>
      <div id="title">${stemName.toUpperCase()}</div>
      <div id="bpm">♩ = ${Math.round(bpm)} BPM · 4/4</div>
    </div>
  </div>
  <div class="clef-badge">${clef === 'bass' ? 'Clé de Fa (𝄢)' : 'Clé de Sol (𝄞)'}</div>
</div>
<div id="score"><div id="loading">Chargement de la partition…</div></div>

<script src="https://cdn.jsdelivr.net/npm/vexflow@4.2.2/build/cjs/vexflow.js"></script>
<script>
(function () {
  const measures = ${measuresJson};
  const accentColor = '${accentColor}';
  const clef = '${clef}';
  const restKey = '${restKey}';
  const startMeasureOffset = ${startMeasureOffset};
  const container = document.getElementById('score');

  if (!measures || measures.length === 0) {
    container.innerHTML = '<div id="empty">Aucune note détectée dans cette piste pour cette page.</div>';
    return;
  }

  try {
    const VF = Vex.Flow;
    const windowW = window.innerWidth || 800;
    const MEASURES_PER_LINE = windowW < 560 ? 2 : 4;
    const STAVE_W = Math.max(180, Math.floor((windowW - 32) / MEASURES_PER_LINE));
    const STAVE_H = 120;
    const LINE_SPACING = 155;
    const PADDING_LEFT = 8;
    const PADDING_TOP = 24;

    const lines = [];
    for (let i = 0; i < measures.length; i += MEASURES_PER_LINE) {
      lines.push(measures.slice(i, i + MEASURES_PER_LINE));
    }

    const totalH = lines.length * LINE_SPACING + PADDING_TOP + 32;
    const totalW = MEASURES_PER_LINE * STAVE_W + PADDING_LEFT + 8;

    container.innerHTML = '';
    const renderer = new VF.Renderer(container, VF.Renderer.Backends.SVG);
    renderer.resize(totalW, totalH);
    const ctx = renderer.getContext();
    ctx.setFillStyle('#F4F1E8');
    ctx.setStrokeStyle('#5A6252');

    lines.forEach((line, lineIdx) => {
      const y = PADDING_TOP + lineIdx * LINE_SPACING;
      const staves = [];

      line.forEach((measureData, mIdx) => {
        const globalIdx = startMeasureOffset + lineIdx * MEASURES_PER_LINE + mIdx;
        const x = PADDING_LEFT + mIdx * STAVE_W;
        const stave = new VF.Stave(x, y, STAVE_W - 2);
        stave.setContext(ctx);

        // Clef and time signature
        if (mIdx === 0) {
          stave.addClef(clef);
          if (lineIdx === 0) stave.addTimeSignature('4/4');
        }
        stave.draw();

        // Measure number badge
        ctx.save();
        ctx.setFillStyle('#6E7666');
        ctx.setFont('sans-serif', 8, 'bold');
        ctx.fillText(String(globalIdx + 1), x + 4, y - 6);
        ctx.restore();

        // Build VexFlow notes
        const vfNotes = measureData.notes.map((n) => {
          const isRest = n.duration.endsWith('r');
          const note = new VF.StaveNote({
            clef: clef,
            keys: isRest ? [restKey] : n.keys,
            duration: n.duration,
            align_center: isRest,
          });

          // Draw dot modifier if note is dotted
          if (n.duration.includes('d')) {
            note.addModifier(new VF.Dot(), 0);
          }

          if (!isRest) {
            note.setStyle({ fillStyle: accentColor, strokeStyle: accentColor });
          } else {
            note.setStyle({ fillStyle: '#4A5043', strokeStyle: '#4A5043' });
          }
          return note;
        });

        // Add accidentals (sharps / flats)
        vfNotes.forEach((vfNote, ni) => {
          const noteData = measureData.notes[ni];
          if (!noteData || noteData.duration.endsWith('r')) return;
          noteData.keys.forEach((key, ki) => {
            if (key.includes('#')) vfNote.addModifier(new VF.Accidental('#'), ki);
            else if (key.includes('b')) vfNote.addModifier(new VF.Accidental('b'), ki);
          });
        });

        try {
          const voice = new VF.Voice({ num_beats: 4, beat_value: 4 }).setMode(VF.Voice.Mode.SOFT);
          voice.addTickables(vfNotes);
          new VF.Formatter().joinVoices([voice]).format([voice], STAVE_W - (mIdx === 0 ? 70 : 40));
          voice.draw(ctx, stave);

          // Connect consecutive 8th and 16th notes with standard beams
          try {
            const notesForBeams = vfNotes.filter((_, idx) => !measureData.notes[idx]?.duration.endsWith('r'));
            const beams = VF.Beam.generateBeams(notesForBeams);
            beams.forEach((b) => {
              b.setStyle({ fillStyle: accentColor, strokeStyle: accentColor });
              b.setContext(ctx).draw();
            });
          } catch (_) {
            // Beams are optional enhancement
          }
        } catch (voiceErr) {
          // Fallback to whole rest if voice formatting fails
          const rest = new VF.StaveNote({ clef: clef, keys: [restKey], duration: 'wr', align_center: true });
          rest.setStyle({ fillStyle: '#4A5043', strokeStyle: '#4A5043' });
          const v2 = new VF.Voice({ num_beats: 4, beat_value: 4 }).setMode(VF.Voice.Mode.SOFT);
          v2.addTickables([rest]);
          new VF.Formatter().joinVoices([v2]).format([v2], STAVE_W - 50);
          v2.draw(ctx, stave);
        }

        staves.push(stave);
      });

      // Connect staves with a right bar line if multiple
      if (staves.length > 1) {
        try {
          new VF.StaveConnector(staves[0], staves[staves.length - 1])
            .setType(VF.StaveConnector.type.SINGLE_RIGHT)
            .setContext(ctx)
            .draw();
        } catch (_) {}
      }
    });
  } catch (err) {
    container.innerHTML = '<div id="error">Impossible d\\'afficher la partition : ' + (err && err.message ? err.message : err) + '</div>';
  }
})();
</script>
</body>
</html>`;
}

export default function ScoreScreen() {
  const { width } = useWindowDimensions();
  const compact = width < 700;
  const params = useLocalSearchParams<{ trackId?: string | string[]; stemName?: string | string[]; trackTitle?: string | string[] }>();
  const trackId = Array.isArray(params.trackId) ? params.trackId[0] : params.trackId;
  const stemName = Array.isArray(params.stemName) ? params.stemName[0] : params.stemName;
  const trackTitle = Array.isArray(params.trackTitle) ? params.trackTitle[0] : params.trackTitle;

  const [clef, setClef] = useState<'treble' | 'bass'>(stemName === 'bass' ? 'bass' : 'treble');
  const [html, setHtml] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [measureCount, setMeasureCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(0);
  const measuresPerPage = compact ? 8 : 16;

  const midiRef = useRef<Midi | null>(null);
  const allMeasuresRef = useRef<MeasureData[]>([]);
  const metaRef = useRef<{ bpm: number; label: string; color: string }>({ bpm: 120, label: '', color: theme.colors.vertStudio });

  const renderPage = (page: number, measures: MeasureData[], bpm: number, label: string, color: string, activeClef = clef) => {
    const start = page * measuresPerPage;
    const slice = measures.slice(start, start + measuresPerPage);
    setHtml(buildVexFlowHtml(slice, label, color, bpm, width, activeClef, start));
  };

  const toggleClef = (newClef: 'treble' | 'bass') => {
    if (newClef === clef) return;
    setClef(newClef);
    if (midiRef.current && stemName) {
      const { measures, bpm } = parseMidiToMeasures(midiRef.current, stemName, newClef);
      allMeasuresRef.current = measures;
      const { label, color } = metaRef.current;
      renderPage(currentPage, measures, bpm, label, color, newClef);
    } else {
      const { bpm, label, color } = metaRef.current;
      renderPage(currentPage, allMeasuresRef.current, bpm, label, color, newClef);
    }
  };

  const downloadMidi = async () => {
    if (!trackId || !stemName || downloading) return;
    setDownloading(true);
    try {
      const url = `${API_URL}/tracks/${encodeURIComponent(trackId)}/transcriptions/${encodeURIComponent(stemName)}`;
      if (Platform.OS === 'web') {
        const res = await fetch(url);
        if (!res.ok) throw new Error('Téléchargement impossible');
        const blob = await res.blob();
        const blobUrl = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = `${stemName}-${trackTitle || 'morceau'}.mid`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(blobUrl);
      }
    } catch (err) {
      console.error('Erreur téléchargement MIDI', err);
    } finally {
      setDownloading(false);
    }
  };

  useEffect(() => {
    if (!trackId || !stemName) {
      setError('Paramètres manquants.');
      setLoading(false);
      return;
    }

    const defaultClef: 'treble' | 'bass' = stemName === 'bass' ? 'bass' : 'treble';
    setClef(defaultClef);

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await axios.get<ArrayBuffer>(
          `${API_URL}/tracks/${encodeURIComponent(trackId)}/transcriptions/${encodeURIComponent(stemName)}`,
          { responseType: 'arraybuffer' },
        );
        const buffer = new Uint8Array(response.data);
        const midi = new Midi(buffer);
        midiRef.current = midi;
        const label = instrumentLabels[stemName] ?? stemName;
        const color = instrumentColors[stemName] ?? theme.colors.vertStudio;
        const { measures, bpm } = parseMidiToMeasures(midi, stemName, defaultClef);

        allMeasuresRef.current = measures;
        metaRef.current = { bpm, label, color };
        setMeasureCount(measures.length);
        setCurrentPage(0);
        renderPage(0, measures, bpm, label, color, defaultClef);
      } catch (err) {
        console.error('Score load error', err);
        setError('Impossible de charger la partition. Vérifiez que la transcription MIDI est disponible pour cette piste.');
      } finally {
        setLoading(false);
      }
    };

    void load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackId, stemName]);

  const totalPages = Math.ceil(measureCount / measuresPerPage);

  const goToPage = (page: number) => {
    const clamped = Math.max(0, Math.min(totalPages - 1, page));
    setCurrentPage(clamped);
    const { bpm, label, color } = metaRef.current;
    renderPage(clamped, allMeasuresRef.current, bpm, label, color, clef);
  };

  const label = instrumentLabels[stemName ?? ''] ?? stemName ?? 'Partition';
  const color = instrumentColors[stemName ?? ''] ?? theme.colors.vertStudio;

  return (
    <View style={styles.screen}>
      {/* Topbar */}
      <View style={styles.topbar}>
        <BackButton />
        <View style={styles.brand}>
          <View style={styles.brandMark}><AudioLines size={15} color={theme.colors.nuitStudio} /></View>
          <Text style={styles.brandText}>POCKETGROOVE <Text style={styles.brandSub}>/ PARTITION</Text></Text>
        </View>
        <Pressable
          onPress={downloadMidi}
          disabled={downloading}
          style={styles.downloadTopButton}
          accessibilityRole="button"
          accessibilityLabel="Télécharger le fichier MIDI"
        >
          {downloading ? (
            <ActivityIndicator size="small" color={theme.colors.vertStudio} />
          ) : (
            <>
              <Download size={13} color={theme.colors.vertStudio} />
              <Text style={styles.downloadTopText}>MIDI</Text>
            </>
          )}
        </Pressable>
      </View>

      {/* Header info & Clef toggle */}
      <View style={[styles.scoreHeader, compact && styles.scoreHeaderCompact]}>
        <View style={[styles.stemBadge, { borderColor: `${color}40`, backgroundColor: `${color}15` }]}>
          <View style={[styles.stemDot, { backgroundColor: color }]} />
          <Text style={[styles.stemBadgeText, { color }]}>{label.toUpperCase()}</Text>
        </View>
        <View style={styles.scoreInfo}>
          <Music2 size={13} color={theme.colors.grisSignal} />
          <Text style={styles.scoreInfoText} numberOfLines={1}>
            {trackTitle ?? 'Morceau'} · {measureCount} mesure{measureCount > 1 ? 's' : ''}
          </Text>
        </View>

        {/* Clef selector (Sol / Fa) */}
        <View style={styles.clefSelector}>
          <Pressable
            onPress={() => toggleClef('treble')}
            style={[styles.clefButton, clef === 'treble' && styles.clefButtonActive]}
            accessibilityRole="button"
            accessibilityLabel="Afficher en clé de Sol"
          >
            <Text style={[styles.clefButtonText, clef === 'treble' && styles.clefButtonTextActive]}>𝄞 Sol</Text>
          </Pressable>
          <Pressable
            onPress={() => toggleClef('bass')}
            style={[styles.clefButton, clef === 'bass' && styles.clefButtonActive]}
            accessibilityRole="button"
            accessibilityLabel="Afficher en clé de Fa"
          >
            <Text style={[styles.clefButtonText, clef === 'bass' && styles.clefButtonTextActive]}>𝄢 Fa</Text>
          </Pressable>
        </View>

        {totalPages > 1 && (
          <View style={styles.pagination}>
            <Pressable
              onPress={() => goToPage(currentPage - 1)}
              disabled={currentPage === 0}
              style={[styles.pageButton, currentPage === 0 && styles.pageButtonDisabled]}
              accessibilityRole="button"
              accessibilityLabel="Page précédente"
            >
              <ChevronLeft size={15} color={currentPage === 0 ? theme.colors.ligne : theme.colors.grisSignal} />
            </Pressable>
            <Text style={styles.pageText}>{currentPage + 1} / {totalPages}</Text>
            <Pressable
              onPress={() => goToPage(currentPage + 1)}
              disabled={currentPage === totalPages - 1}
              style={[styles.pageButton, currentPage === totalPages - 1 && styles.pageButtonDisabled]}
              accessibilityRole="button"
              accessibilityLabel="Page suivante"
            >
              <ChevronRight size={15} color={currentPage === totalPages - 1 ? theme.colors.ligne : theme.colors.grisSignal} />
            </Pressable>
          </View>
        )}
      </View>

      {/* Content */}
      {loading ? (
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={theme.colors.vertStudio} />
          <Text style={styles.stateText}>Analyse du fichier MIDI…</Text>
        </View>
      ) : error ? (
        <View style={styles.centerState}>
          <View style={styles.errorIcon}><BookOpen size={22} color={theme.colors.state.erreur} /></View>
          <Text style={styles.errorTitle}>Partition indisponible</Text>
          <Text style={styles.stateText}>{error}</Text>
        </View>
      ) : html ? (
        <ScoreView html={html} title={`Partition ${label}`} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.nuitStudio },
  topbar: { height: 68, borderBottomWidth: 1, borderBottomColor: theme.colors.ligne, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16 },
  topbarSpacer: { width: 86 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brandMark: { width: 26, height: 26, borderRadius: 8, backgroundColor: theme.colors.vertStudio, alignItems: 'center', justifyContent: 'center' },
  brandText: { color: theme.colors.blancCasse, fontWeight: '700', fontSize: 10, letterSpacing: 1.1 },
  brandSub: { color: theme.colors.grisSignal, fontWeight: '400' },
  scoreHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: theme.colors.ligne, flexWrap: 'wrap' },
  scoreHeaderCompact: { paddingVertical: 10, gap: 8 },
  stemBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1 },
  stemDot: { width: 7, height: 7, borderRadius: 4 },
  stemBadgeText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8 },
  scoreInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  scoreInfoText: { color: theme.colors.grisSignal, fontSize: 12 },
  clefSelector: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#181A16', borderRadius: 8, padding: 3, borderWidth: 1, borderColor: theme.colors.ligne },
  clefButton: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  clefButtonActive: { backgroundColor: '#283022', borderWidth: 1, borderColor: '#C3F36B40' },
  clefButtonText: { color: theme.colors.grisSignal, fontSize: 11, fontWeight: '600' },
  clefButtonTextActive: { color: theme.colors.vertStudio },
  downloadTopButton: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: '#C3F36B40', backgroundColor: '#1A2316' },
  downloadTopText: { color: theme.colors.vertStudio, fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  pagination: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  pageButton: { width: 30, height: 30, borderRadius: 8, borderWidth: 1, borderColor: theme.colors.ligne, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.console },
  pageButtonDisabled: { opacity: 0.4 },
  pageText: { color: theme.colors.grisSignal, fontSize: 11, minWidth: 36, textAlign: 'center' },
  centerState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  errorIcon: { width: 50, height: 50, borderRadius: 14, backgroundColor: '#2A1D1A', alignItems: 'center', justifyContent: 'center' },
  errorTitle: { color: theme.colors.blancCasse, fontSize: 16, fontWeight: '700' },
  stateText: { color: theme.colors.grisSignal, fontSize: 13, lineHeight: 20, textAlign: 'center', maxWidth: 380 },
});
