// Spring design system — every screen reads colors through useTheme() so the
// whole app (including dark mode) stays visually consistent from one place.

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 };
export const radius = { sm: 8, md: 12, lg: 20, pill: 999 };
export const typography = {
  h1: { fontSize: 30, fontWeight: "800" },
  h2: { fontSize: 22, fontWeight: "700" },
  body: { fontSize: 15, fontWeight: "500" },
  caption: { fontSize: 13, fontWeight: "500" },
};

export const lightColors = {
  mode: "light",
  primary: "#5B3DF5",
  primaryDark: "#3F27B0",
  accent: "#00D9A6",
  accentSoft: "#E4FBF4",
  warning: "#FF9F45",
  danger: "#FF5C5C",
  background: "#F7F7FB",
  surface: "#FFFFFF",
  border: "#ECECF3",
  textPrimary: "#181828",
  textSecondary: "#71717E",
  textMuted: "#A6A6B3",
  white: "#FFFFFF",
  overlay: "rgba(24,24,40,0.45)",
  gradientStart: "#5B3DF5",
  gradientEnd: "#2A1B7A",
};

export const darkColors = {
  mode: "dark",
  primary: "#8471FF",
  primaryDark: "#5B3DF5",
  accent: "#00D9A6",
  accentSoft: "#123B33",
  warning: "#FFB268",
  danger: "#FF7A7A",
  background: "#0F0F17",
  surface: "#1A1A26",
  border: "#2A2A3A",
  textPrimary: "#F2F2F7",
  textSecondary: "#B5B5C3",
  textMuted: "#75758A",
  white: "#FFFFFF",
  overlay: "rgba(0,0,0,0.55)",
  gradientStart: "#2A1B7A",
  gradientEnd: "#0F0F17",
};

// Shared, reusable style fragments — built from whichever palette is active
// so screens don't redefine the same card/button look.
export function makeShared(colors) {
  return {
    screen: { flex: 1, backgroundColor: colors.background },
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      padding: spacing.md,
      borderWidth: 1,
      borderColor: colors.border,
      shadowColor: "#000",
      shadowOpacity: colors.mode === "dark" ? 0.25 : 0.04,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 3 },
      elevation: 1,
    },
    primaryButton: {
      backgroundColor: colors.primary,
      borderRadius: radius.md,
      paddingVertical: 16,
      alignItems: "center",
      justifyContent: "center",
    },
    primaryButtonText: { color: colors.white, fontSize: 16, fontWeight: "700" },
    input: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      padding: 14,
      fontSize: 16,
      color: colors.textPrimary,
      marginBottom: spacing.sm,
    },
  };
}

// Static fallback (light) for any code that isn't inside a component tree —
// prefer useTheme() from ThemeContext wherever possible.
export const colors = lightColors;
export const shared = makeShared(lightColors);
