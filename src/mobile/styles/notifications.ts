import { StyleSheet } from "react-native";

import { cardShadow, colors } from "./theme.ts";

export const styles = StyleSheet.create({
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 4,
  },
  titleIcon: {
    width: 46,
    height: 46,
    borderRadius: 15,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  titleIconText: { color: colors.primary, fontSize: 20, fontWeight: "800" },
  titleCopy: { flex: 1 },
  heading: {
    fontSize: 22,
    fontWeight: "900",
    color: colors.text,
    letterSpacing: -0.4,
  },
  strong: { flex: 1, fontWeight: "800", color: colors.text },
  text: { color: colors.text, lineHeight: 21 },
  muted: { color: colors.textSoft, fontSize: 12, lineHeight: 18 },
  meta: { color: colors.textSoft, fontSize: 11, lineHeight: 17 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginVertical: 6 },
  button: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 11,
    backgroundColor: colors.primary,
  },
  buttonText: { color: "#fff", fontWeight: "700", fontSize: 12 },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 17,
    padding: 14,
    gap: 8,
    ...cardShadow,
  },
  unread: { borderColor: "#C8CBFF", backgroundColor: "#FAFAFF" },
  notificationTitle: { flexDirection: "row", alignItems: "center", gap: 8 },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
  },
  empty: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    padding: 24,
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyIcon: { color: colors.accent, fontSize: 28, fontWeight: "900" },
});
