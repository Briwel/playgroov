import { useRouter } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import { Pressable, StyleSheet, Text } from 'react-native';

import { theme } from '../theme';

export function BackButton() {
  const router = useRouter();

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  return (
    <Pressable
      onPress={goBack}
      accessibilityRole="button"
      accessibilityLabel="Revenir à la page précédente"
      hitSlop={8}
      style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}>
      <ArrowLeft size={17} color={theme.colors.blancCasse} />
      <Text style={styles.label}>Retour</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, borderRadius: 9, borderWidth: 1, borderColor: theme.colors.ligne, backgroundColor: theme.colors.console },
  buttonPressed: { backgroundColor: theme.colors.filConsole },
  label: { color: theme.colors.blancCasse, fontFamily: theme.typography.manrope.medium, fontSize: 13, fontWeight: '500' },
});
