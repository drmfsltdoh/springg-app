import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme } from "../context/ThemeContext";

export default function LandingScreen({ navigation }) {
  const { colors, isDark, toggleTheme } = useTheme();
  const styles = makeStyles(colors);

  return (
    <LinearGradient colors={[colors.gradientStart, colors.gradientEnd]} style={styles.container}>
      <TouchableOpacity style={styles.themeToggle} onPress={toggleTheme}>
        <Text style={styles.themeToggleText}>{isDark ? "☀️" : "🌙"}</Text>
      </TouchableOpacity>

      <View style={styles.hero}>
        <View style={styles.logoCircle}>
          <Text style={styles.logoEmoji}>🚗</Text>
        </View>
        <Text style={styles.title}>Spring</Text>
        <Text style={styles.tagline}>Your ride, your way.</Text>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity style={styles.primaryButton} onPress={() => navigation.navigate("Signup")}>
          <Text style={styles.primaryButtonText}>Get Started</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryButton} onPress={() => navigation.navigate("Login")}>
          <Text style={styles.secondaryButtonText}>I already have an account</Text>
        </TouchableOpacity>
      </View>
    </LinearGradient>
  );
}

function makeStyles(colors) {
  return StyleSheet.create({
    container: { flex: 1, justifyContent: "space-between", padding: 24, paddingTop: 70, paddingBottom: 50 },
    themeToggle: {
      alignSelf: "flex-end",
      width: 42,
      height: 42,
      borderRadius: 21,
      backgroundColor: "rgba(255,255,255,0.15)",
      alignItems: "center",
      justifyContent: "center",
    },
    themeToggleText: { fontSize: 18 },
    hero: { alignItems: "center", flex: 1, justifyContent: "center" },
    logoCircle: {
      width: 96,
      height: 96,
      borderRadius: 48,
      backgroundColor: "rgba(255,255,255,0.15)",
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 20,
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.25)",
    },
    logoEmoji: { fontSize: 44 },
    title: { fontSize: 42, fontWeight: "800", color: "#FFFFFF", letterSpacing: 0.5 },
    tagline: { fontSize: 16, color: "rgba(255,255,255,0.8)", marginTop: 8 },
    actions: { gap: 12 },
    primaryButton: {
      backgroundColor: "#FFFFFF",
      borderRadius: 14,
      paddingVertical: 16,
      alignItems: "center",
    },
    primaryButtonText: { color: colors.primaryDark, fontSize: 16, fontWeight: "800" },
    secondaryButton: {
      borderRadius: 14,
      paddingVertical: 16,
      alignItems: "center",
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.4)",
    },
    secondaryButtonText: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },
  });
}
