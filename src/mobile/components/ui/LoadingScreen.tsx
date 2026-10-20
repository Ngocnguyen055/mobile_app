import React from "react";
import { SafeAreaView, StatusBar, Text, View } from "react-native";

import { styles } from "../../styles/app.ts";
import { colors } from "../../styles/theme.ts";

export default function LoadingScreen() {
  return (
    <SafeAreaView style={styles.page}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />
      <View style={styles.loading}>
        <View style={styles.loadingLogo}>
          <Text style={styles.loadingLogoText}>✓</Text>
        </View>
        <Text style={styles.loadingTitle}>Student Planner</Text>
        <Text style={styles.muted}>Đang chuẩn bị không gian của bạn…</Text>
      </View>
    </SafeAreaView>
  );
}
