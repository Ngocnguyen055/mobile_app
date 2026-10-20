import { StyleSheet } from "react-native";

import { cardShadow, colors } from "./theme.ts";

export const styles = StyleSheet.create({
  container: { gap: 6, zIndex: 5 },
  label: { color: colors.text, fontSize: 13, fontWeight: "800" },
  trigger: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 13,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  clockBadge: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primarySoft,
  },
  clockIcon: { color: colors.primary, fontSize: 19, fontWeight: "800" },
  selectedText: {
    flex: 1,
    color: colors.text,
    fontSize: 14,
    fontWeight: "700",
  },
  arrow: { color: colors.primary, fontSize: 20, fontWeight: "800" },
  menu: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    backgroundColor: colors.surface,
    overflow: "hidden",
    ...cardShadow,
  },
  option: {
    minHeight: 46,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  optionBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  selectedOption: { backgroundColor: colors.primarySoft },
  optionText: { flex: 1, color: colors.text, fontSize: 14 },
  selectedOptionText: { color: colors.primaryDark, fontWeight: "800" },
  check: { color: colors.primary, fontSize: 17, fontWeight: "900" },
  disabled: { opacity: 0.45 },
});
