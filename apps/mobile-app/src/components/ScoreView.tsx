import { StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import { theme } from '../theme';

type ScoreViewProps = {
  html: string;
  title: string;
};

export function ScoreView({ html }: ScoreViewProps) {
  return (
    <WebView
      source={{ html }}
      style={styles.webview}
      originWhitelist={['*']}
      scrollEnabled
      showsVerticalScrollIndicator={false}
      backgroundColor={theme.colors.nuitStudio}
    />
  );
}

const styles = StyleSheet.create({
  webview: { flex: 1, backgroundColor: theme.colors.nuitStudio },
});
