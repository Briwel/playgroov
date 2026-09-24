import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { theme } from '../theme';

export const PrimaryButton = ({ title, onPress }: { title: string, onPress: () => void }) => (
  <TouchableOpacity style={styles.button} onPress={onPress}>
    <Text style={styles.text}>{title}</Text>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  button: {
    backgroundColor: theme.colors.violetBasic,
    padding: 16,
    borderRadius: 14,
    alignItems: 'center',
  },
  text: { color: theme.colors.blancCasse, fontFamily: theme.typography.manrope.semiBold },
});
