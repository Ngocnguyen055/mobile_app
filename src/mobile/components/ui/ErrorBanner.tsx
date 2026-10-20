import React from "react";
import { Pressable, Text, View } from "react-native";

import { styles } from "../../styles/app.ts";

type ErrorBannerProps = {
  message: string;
  onDismiss: () => void;
};

export default function ErrorBanner({ message, onDismiss }: ErrorBannerProps) {
  if (!message) return null;

  return (
    <View style={styles.errorBox}>
      <Text style={styles.error}>{message}</Text>
      <Pressable accessibilityRole="button" onPress={onDismiss}>
        <Text style={styles.errorClose}>Đóng</Text>
      </Pressable>
    </View>
  );
}
