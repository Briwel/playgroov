import { Link, type Href } from 'expo-router';
import { ArrowRight, AudioLines, Disc3, History as HistoryIcon, Plus } from 'lucide-react-native';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { theme } from '../src/theme';

const waveform = [20, 32, 18, 42, 26, 48, 30, 17, 38, 27, 46, 21, 33, 16, 41, 25, 49, 29, 18, 36, 24, 44, 19, 31, 47, 23, 38, 16, 29, 42, 20, 35];

export default function HomeScreen() {
  const compact = useWindowDimensions().width < 760;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.page, compact && styles.pageCompact]}>
      <View style={styles.topbar}>
        <View style={styles.brand}>
          <View style={styles.brandMark}><AudioLines size={18} color={theme.colors.nuitStudio} /></View>
          <Text style={styles.brandName}>pocketgroove<Text style={styles.brandStudio}> / STUDIO</Text></Text>
        </View>
        <View style={styles.sessionBadge}><View style={styles.statusDot} /><Text style={styles.sessionText}>VOTRE ESPACE STUDIO</Text></View>
      </View>

      <View style={[styles.hero, compact && styles.heroCompact]}>
        <View style={styles.heroCopy}>
          <Text style={styles.eyebrow}>CRÉER · ÉCOUTER · TRANSFORMER</Text>
          <Text style={[styles.headline, compact && styles.headlineCompact]}>Tout commence{ '\n' }par une <Text style={styles.headlineAccent}>vibration.</Text></Text>
          <Text style={styles.intro}>Importez vos prises, isolez chaque instrument et donnez une nouvelle direction à vos morceaux.</Text>
          <Link href={'/import' as Href} asChild>
            <Pressable style={styles.primaryLink}><Text style={styles.primaryLinkText}>Nouveau morceau</Text></Pressable>
          </Link>
        </View>
        <View style={[styles.artCard, compact && styles.artCardCompact]}>
          <View style={styles.artGlow} />
          <View style={styles.waveform}>
            {waveform.map((height, index) => <View key={index} style={[styles.waveformBar, { height }]} />)}
          </View>
          <Disc3 size={122} color={theme.colors.vertStudio} strokeWidth={0.8} />
          <View style={styles.artCaption}><Text style={styles.artCaptionTop}>SESSION N° 001</Text><Text style={styles.artCaptionBottom}>FIND YOUR FREQUENCY</Text></View>
        </View>
      </View>

      <View style={styles.sectionHeading}>
        <View><Text style={styles.eyebrow}>VOTRE ESPACE DE TRAVAIL</Text><Text style={styles.sectionTitle}>Le studio est à vous.</Text></View>
      </View>

      <View style={[styles.cards, compact && styles.cardsCompact]}>
        <Link href={'/import' as Href} asChild>
        <Pressable style={styles.toolCard}>
          <View style={styles.toolIcon}><Plus size={19} color={theme.colors.vertStudio} /></View>
          <Text style={styles.cardTitle}>Importer un morceau</Text>
          <Text style={styles.cardDescription}>Choisissez un fichier audio pour commencer à travailler dessus.</Text>
          <View style={styles.cardArrow}><ArrowRight size={17} color={theme.colors.vertStudio} /></View>
        </Pressable>
        </Link>
        <Link href={'/history' as Href} asChild>
        <Pressable style={styles.toolCard}>
          <View style={[styles.toolIcon, styles.toolIconWarm]}><AudioLines size={19} color={theme.colors.ambre} /></View>
          <Text style={styles.cardTitle}>Séparer les pistes</Text>
          <Text style={styles.cardDescription}>Choisissez un morceau importé pour retrouver ses instruments.</Text>
          <View style={[styles.cardArrow, styles.cardArrowWarm]}><ArrowRight size={17} color={theme.colors.ambre} /></View>
        </Pressable>
        </Link>
        <Link href={'/history' as Href} asChild>
          <Pressable style={styles.toolCard}>
            <View style={[styles.toolIcon, styles.toolIconMuted]}><HistoryIcon size={19} color={theme.colors.blancCasse} /></View>
            <Text style={styles.cardTitle}>Historique des morceaux</Text>
            <Text style={styles.cardDescription}>Retrouvez vos imports et reprenez vos sessions précédentes.</Text>
            <View style={styles.cardArrow}><ArrowRight size={17} color={theme.colors.vertStudio} /></View>
          </Pressable>
        </Link>
      </View>

      <View style={styles.footer}>
        <View style={styles.footerRule} /><Text style={styles.footerText}>FAIT POUR CELLES ET CEUX QUI ÉCOUTENT AUTREMENT.</Text><View style={styles.footerRule} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.nuitStudio },
  page: { width: '100%', maxWidth: 1120, alignSelf: 'center', paddingHorizontal: 28, paddingBottom: 48 },
  pageCompact: { paddingHorizontal: 20 },
  topbar: { minHeight: 76, borderBottomWidth: 1, borderBottomColor: theme.colors.ligne, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  brandMark: { width: 30, height: 30, borderRadius: 9, backgroundColor: theme.colors.vertStudio, alignItems: 'center', justifyContent: 'center' },
  brandName: { color: theme.colors.blancCasse, fontFamily: theme.typography.manrope.semiBold, fontSize: 14, fontWeight: '700', letterSpacing: -0.3 },
  brandStudio: { color: theme.colors.grisSignal, fontSize: 10, letterSpacing: 1.5 },
  sessionBadge: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: theme.colors.ligne, paddingHorizontal: 11, paddingVertical: 8, borderRadius: 99 },
  statusDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: theme.colors.vertStudio },
  sessionText: { color: theme.colors.grisSignal, fontSize: 10, letterSpacing: 1.1 },
  hero: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 68, paddingBottom: 72, gap: 28 },
  heroCompact: { flexDirection: 'column', alignItems: 'stretch', paddingTop: 43, paddingBottom: 48, gap: 30 },
  heroCopy: { flex: 1, maxWidth: 590 },
  eyebrow: { color: theme.colors.vertStudio, fontSize: 10, letterSpacing: 2, fontWeight: '700' },
  headline: { color: theme.colors.blancCasse, fontFamily: theme.typography.manrope.semiBold, fontSize: 54, lineHeight: 59, fontWeight: '600', letterSpacing: -2.5, marginTop: 16 },
  headlineCompact: { fontSize: 41, lineHeight: 47, letterSpacing: -1.8 },
  headlineAccent: { color: theme.colors.vertStudio, fontStyle: 'italic' },
  intro: { color: theme.colors.grisSignal, fontFamily: theme.typography.manrope.regular, fontSize: 15, lineHeight: 24, maxWidth: 470, marginTop: 17 },
  primaryLink: { marginTop: 26, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', backgroundColor: theme.colors.vertStudio, paddingVertical: 13, paddingHorizontal: 18, borderRadius: 8 },
  primaryLinkText: { color: theme.colors.nuitStudio, fontWeight: '700', fontSize: 14 },
  artCard: { width: 270, height: 235, borderRadius: 18, borderWidth: 1, borderColor: '#363D2D', backgroundColor: '#1A2017', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  artCardCompact: { width: '100%', height: 165 },
  artGlow: { position: 'absolute', width: 180, height: 180, borderRadius: 90, backgroundColor: '#303C22', opacity: 0.56 },
  waveform: { position: 'absolute', left: 10, right: 10, height: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3, opacity: 0.3 },
  waveformBar: { flex: 1, maxWidth: 5, borderRadius: 3, backgroundColor: theme.colors.vertStudio },
  artCaption: { position: 'absolute', left: 18, right: 18, bottom: 17, flexDirection: 'row', justifyContent: 'space-between' },
  artCaptionTop: { color: theme.colors.grisSignal, fontSize: 8, letterSpacing: 1.2 },
  artCaptionBottom: { color: theme.colors.vertStudio, fontSize: 8, letterSpacing: 1.2 },
  sectionHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 18 },
  sectionTitle: { color: theme.colors.blancCasse, fontFamily: theme.typography.manrope.semiBold, fontSize: 24, fontWeight: '600', letterSpacing: -0.8, marginTop: 6 },
  cards: { flexDirection: 'row', gap: 13 },
  cardsCompact: { flexDirection: 'column' },
  toolCard: { flex: 1, minHeight: 212, borderWidth: 1, borderColor: theme.colors.ligne, borderRadius: 13, backgroundColor: theme.colors.console, padding: 18, position: 'relative' },
  comingSoon: { opacity: 0.64 },
  toolIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#303A25', marginBottom: 21 },
  toolIconWarm: { backgroundColor: '#3A3021' },
  toolIconMuted: { backgroundColor: '#2C2F2A' },
  cardTitle: { color: theme.colors.blancCasse, fontFamily: theme.typography.manrope.semiBold, fontSize: 20, lineHeight: 26, fontWeight: '600', marginTop: 2, maxWidth: 190 },
  cardDescription: { color: theme.colors.grisSignal, fontSize: 12, lineHeight: 18, marginTop: 8, maxWidth: 210 },
  cardArrow: { position: 'absolute', right: 16, bottom: 16, width: 30, height: 30, borderRadius: 15, backgroundColor: '#303A25', alignItems: 'center', justifyContent: 'center' },
  cardArrowWarm: { backgroundColor: '#3A3021' },
  soonPill: { position: 'absolute', right: 14, bottom: 17, borderWidth: 1, borderColor: '#515449', borderRadius: 99, paddingHorizontal: 9, paddingVertical: 5 },
  soonText: { color: theme.colors.grisSignal, fontSize: 9, letterSpacing: 1 },
  footer: { marginTop: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 15 },
  footerRule: { height: 1, width: 30, backgroundColor: theme.colors.ligne },
  footerText: { color: theme.colors.grisSignal, fontSize: 9, letterSpacing: 1.2, textAlign: 'center' },
});
