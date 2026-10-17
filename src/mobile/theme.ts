export const colors = {
  primary: "#5B5FEF",
  primaryDark: "#4548C8",
  primarySoft: "#EEF0FF",
  accent: "#14B8A6",
  accentSoft: "#CCFBF1",
  background: "#F6F7FB",
  surface: "#FFFFFF",
  surfaceMuted: "#F1F3F9",
  text: "#182034",
  textSoft: "#687086",
  border: "#E4E7F0",
  danger: "#DC4655",
  dangerSoft: "#FFF0F1",
  warning: "#F59E0B",
  success: "#16A47A",
  shadow: "#202754",
} as const;

export const cardShadow = {
  shadowColor: colors.shadow,
  shadowOffset: { width: 0, height: 6 },
  shadowOpacity: 0.07,
  shadowRadius: 14,
  elevation: 3,
} as const;
