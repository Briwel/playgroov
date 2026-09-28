import { StyleSheet, View } from 'react-native';
import { theme } from '../theme';

type ScoreViewProps = {
  html: string;
  title: string;
};

export function ScoreView({ html, title }: ScoreViewProps) {
  return (
    <View style={styles.container}>
      <iframe
        srcDoc={html}
        style={{ flex: 1, border: 'none', width: '100%', height: '100%', backgroundColor: theme.colors.nuitStudio }}
        title={title}
        sandbox="allow-scripts"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});
