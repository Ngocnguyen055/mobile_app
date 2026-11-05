import { StyleSheet } from "react-native";
import { cardShadow, colors } from "../theme.ts";
export const accountStyles = StyleSheet.create({
  profileCard: {
    backgroundColor: colors.primary,
    borderRadius: 21,
    padding: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    marginTop: 3,
    ...cardShadow,
  },
  profileAvatar: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.28)",
  },
  profileAvatarText: { color: "#FFFFFF", fontSize: 24, fontWeight: "900" },
  profileInfo: { flex: 1, gap: 3 },
  profileName: { color: "#FFFFFF", fontSize: 19, fontWeight: "900" },
  profileEmail: { color: "#E7E8FF", fontSize: 12 },
  verifiedBadge: {
    width: 25,
    height: 25,
    borderRadius: 13,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  verifiedText: { color: "#FFFFFF", fontWeight: "900" },
  connectionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 3,
  },
  connectionDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: "#B5BBC9",
  },
  connectionDotActive: { backgroundColor: colors.success },
  connectionText: { flex: 1, color: colors.textSoft, fontSize: 13 }
});
