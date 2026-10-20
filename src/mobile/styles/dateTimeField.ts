import { StyleSheet } from "react-native";

import { colors } from "./theme.ts";

export const styles = StyleSheet.create({
  container: { gap: 5 },
  label: { color: colors.text, fontSize: 13, fontWeight: "800" },
  field: {
    minHeight: 46,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: 13,
    paddingHorizontal: 13,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  value: { color: colors.text, fontSize: 15 },
  placeholder: { color: colors.textSoft },
  icon: { color: colors.primary, fontSize: 22, fontWeight: "700" },
  disabled: { opacity: 0.5 },
});
