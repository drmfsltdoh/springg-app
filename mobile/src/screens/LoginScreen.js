import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, KeyboardAvoidingView, Platform } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { api } from "../api/api";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";

export default function LoginScreen({ navigation }) {
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const { colors, isDark, toggleTheme } = useTheme();
  const styles = makeStyles(colors);

  async function handleLogin() {
    if (!phone || !password) return Alert.alert("Missing info", "Enter your phone number and password");
    setLoading(true);
    try {
      const data = await api.login({ phone, password });
      await login(data.user);
      navigation.replace(data.user.role === "driver" ? "DriverHome" : "RiderHome");
    } catch (e) {
      Alert.alert("Login failed", e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <LinearGradient colors={[colors.gradientStart, colors.gradientEnd]} style={styles.background}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}>
        <TouchableOpacity style={styles.themeToggle} onPress={toggleTheme}>
          <Text style={styles.themeToggleText}>{isDark ? "☀️" : "🌙"}</Text>
        </TouchableOpacity>

        <View style={styles.brand}>
          <View style={styles.logoCircle}>
            <Text style={styles.logoEmoji}>🚗</Text>
          </View>
          <Text style={styles.title}>Spring</Text>
          <Text style={styles.tagline}>Fair rides. Clear prices. Better protection.</Text>
        </View>

        <View style={styles.card}>
          <TextInput
            style={styles.input}
            placeholder="Phone number (e.g. +2348012345678)"
            placeholderTextColor={colors.textMuted}
            keyboardType="phone-pad"
            value={phone}
            onChangeText={setPhone}
          />
          <TextInput style={styles.input} placeholder="Password" placeholderTextColor={colors.textMuted} secureTextEntry value={password} onChangeText={setPassword} />

          <TouchableOpacity style={styles.primaryButton} onPress={handleLogin} disabled={loading}>
            <Text style={styles.primaryButtonText}>{loading ? "Logging in..." : "Log In"}</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => navigation.navigate("Signup")}>
            <Text style={styles.link}>Don't have an account? <Text style={styles.linkBold}>Sign up</Text></Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

function makeStyles(colors) {
  return StyleSheet.create({
    background: { flex: 1 },
    flex: { flex: 1, padding: 24, justifyContent: "center" },
    themeToggle: {
      position: "absolute", top: 60, right: 24, width: 42, height: 42, borderRadius: 21,
      backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center",
    },
    themeToggleText: { fontSize: 18 },
    brand: { alignItems: "center", marginBottom: 28 },
    logoCircle: {
      width: 72, height: 72, borderRadius: 36, backgroundColor: "rgba(255,255,255,0.15)",
      alignItems: "center", justifyContent: "center", marginBottom: 14, borderWidth: 1, borderColor: "rgba(255,255,255,0.25)",
    },
    logoEmoji: { fontSize: 32 },
    title: { fontSize: 30, fontWeight: "800", color: "#FFFFFF" },
    tagline: { color: "rgba(255,255,255,0.8)", marginTop: 4, textAlign: "center", paddingHorizontal: 20 },
    card: {
      backgroundColor: colors.surface, borderRadius: 20, padding: 20,
      shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 16, shadowOffset: { width: 0, height: 8 },
    },
    input: {
      backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, borderRadius: 12,
      padding: 14, fontSize: 16, color: colors.textPrimary, marginBottom: 12,
    },
    primaryButton: { backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 16, alignItems: "center" },
    primaryButtonText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
    link: { textAlign: "center", marginTop: 16, color: colors.textSecondary },
    linkBold: { color: colors.primary, fontWeight: "700" },
  });
}
