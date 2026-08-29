import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { Appearance } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { lightColors, darkColors, makeShared, spacing, radius, typography } from "../theme";

const THEME_STORAGE_KEY = "awa_theme_mode"; // "light" | "dark" | "system"

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [preference, setPreference] = useState("system"); // what the user picked
  const [systemScheme, setSystemScheme] = useState(Appearance.getColorScheme() || "light");
  const [ready, setReady] = useState(false);

  // Load saved preference once on app start
  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(THEME_STORAGE_KEY);
        if (saved) setPreference(saved);
      } catch (e) {
        // no-op — fall back to system
      } finally {
        setReady(true);
      }
    })();
  }, []);

  useEffect(() => {
    const sub = Appearance.addChangeListener(({ colorScheme }) => {
      setSystemScheme(colorScheme || "light");
    });
    return () => sub.remove();
  }, []);

  const mode = preference === "system" ? systemScheme : preference;

  async function setThemePreference(next) {
    setPreference(next);
    try {
      await AsyncStorage.setItem(THEME_STORAGE_KEY, next);
    } catch (e) {
      // ignore persistence errors — theme still applies for this session
    }
  }

  async function toggleTheme() {
    // Simple two-way toggle for a quick switch in the UI; "system" is still
    // selectable via setThemePreference("system") if you wire that up later.
    await setThemePreference(mode === "dark" ? "light" : "dark");
  }

  const value = useMemo(() => {
    const colors = mode === "dark" ? darkColors : lightColors;
    return {
      mode,
      preference,
      isDark: mode === "dark",
      colors,
      shared: makeShared(colors),
      spacing,
      radius,
      typography,
      toggleTheme,
      setThemePreference,
      ready,
    };
  }, [mode, preference, ready]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
}
