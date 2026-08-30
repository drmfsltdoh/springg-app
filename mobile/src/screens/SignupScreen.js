import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ScrollView, Image, ActivityIndicator } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import { api } from "../api/api";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";

const IMAGE_PICKER_OPTIONS = {
  mediaTypes: ImagePicker.MediaTypeOptions.Images,
  quality: 0.5,
  base64: true,
  allowsEditing: true,
};

export default function SignupScreen({ navigation }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("rider");
  const [plateNumber, setPlateNumber] = useState("");
  const [car, setCar] = useState("");
  const [profilePhoto, setProfilePhoto] = useState(null);
  const [idDocument, setIdDocument] = useState(null);
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const { colors, isDark, toggleTheme } = useTheme();
  const styles = makeStyles(colors);

  async function pickImage(setter) {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return Alert.alert("Permission needed", "Spring needs photo library access to upload this.");
    const result = await ImagePicker.launchImageLibraryAsync(IMAGE_PICKER_OPTIONS);
    if (!result.canceled && result.assets?.[0]) {
      const asset = result.assets[0];
      setter({ uri: asset.uri, base64: asset.base64 });
    }
  }

  async function handleSignup() {
    if (!name || !phone || !password) return Alert.alert("Missing info", "Fill in all fields");
    if (role === "driver") {
      if (!car || !plateNumber) return Alert.alert("Missing info", "Enter your car and plate number");
      if (!profilePhoto) return Alert.alert("Photo required", "Upload a clear photo of yourself");
      if (!idDocument) return Alert.alert("ID required", "Upload a photo of your driver's license or government ID");
    }
    setLoading(true);
    try {
      const data = await api.signup({ phone, email, password, role, name });

      if (role === "driver") {
        await api.registerVehicle({ plateNumber, make: car });
        await api.uploadDriverDocument("profile_photo", profilePhoto.base64);
        await api.uploadDriverDocument("national_id", idDocument.base64);
      }

      await login({ ...data.user, name });
      navigation.replace(role === "driver" ? "DriverHome" : "RiderHome");
    } catch (e) {
      Alert.alert("Signup failed", e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <LinearGradient colors={[colors.gradientStart, colors.gradientEnd]} style={styles.background}>
      <TouchableOpacity style={styles.themeToggle} onPress={toggleTheme}>
        <Text style={styles.themeToggleText}>{isDark ? "☀️" : "🌙"}</Text>
      </TouchableOpacity>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.card}>
          <Text style={styles.title}>Create Account</Text>

          <View style={styles.roleRow}>
            <TouchableOpacity style={[styles.roleButton, role === "rider" && styles.roleButtonActive]} onPress={() => setRole("rider")}>
              <Text style={role === "rider" ? styles.roleTextActive : styles.roleText}>🧍 I'm a Rider</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.roleButton, role === "driver" && styles.roleButtonActive]} onPress={() => setRole("driver")}>
              <Text style={role === "driver" ? styles.roleTextActive : styles.roleText}>🚗 I'm a Driver</Text>
            </TouchableOpacity>
          </View>

          <TextInput style={styles.input} placeholder="Legal full name" placeholderTextColor={colors.textMuted} value={name} onChangeText={setName} />
          <TextInput style={styles.input} placeholder="Phone number (e.g. +2348012345678)" placeholderTextColor={colors.textMuted} keyboardType="phone-pad" value={phone} onChangeText={setPhone} />
          <TextInput style={styles.input} placeholder="Email (optional)" placeholderTextColor={colors.textMuted} autoCapitalize="none" value={email} onChangeText={setEmail} />
          <TextInput style={styles.input} placeholder="Password" placeholderTextColor={colors.textMuted} secureTextEntry value={password} onChangeText={setPassword} />

          {role === "driver" && (
            <>
              <TextInput style={styles.input} placeholder="Car (e.g. Toyota Corolla)" placeholderTextColor={colors.textMuted} value={car} onChangeText={setCar} />
              <TextInput style={styles.input} placeholder="Plate number" placeholderTextColor={colors.textMuted} value={plateNumber} onChangeText={setPlateNumber} />

              <Text style={styles.sectionLabel}>Profile photo</Text>
              <TouchableOpacity style={styles.uploadBox} onPress={() => pickImage(setProfilePhoto)}>
                {profilePhoto ? <Image source={{ uri: profilePhoto.uri }} style={styles.uploadPreview} /> : <Text style={styles.uploadText}>📷  Upload photo</Text>}
              </TouchableOpacity>

              <Text style={styles.sectionLabel}>ID verification</Text>
              <Text style={styles.sectionHint}>Our team reviews this manually before you can go online.</Text>
              <TouchableOpacity style={styles.uploadBox} onPress={() => pickImage(setIdDocument)}>
                {idDocument ? <Image source={{ uri: idDocument.uri }} style={styles.uploadPreview} /> : <Text style={styles.uploadText}>🪪  Upload ID document</Text>}
              </TouchableOpacity>
            </>
          )}

          <TouchableOpacity style={styles.primaryButton} onPress={handleSignup} disabled={loading}>
            {loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryButtonText}>Create Account</Text>}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigation.navigate("Login")}>
            <Text style={styles.link}>Already have an account? <Text style={styles.linkBold}>Log in</Text></Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </LinearGradient>
  );
}

function makeStyles(colors) {
  return StyleSheet.create({
    background: { flex: 1 },
    themeToggle: {
      position: "absolute", top: 60, right: 24, zIndex: 10, width: 42, height: 42, borderRadius: 21,
      backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center",
    },
    themeToggleText: { fontSize: 18 },
    container: { flexGrow: 1, justifyContent: "center", padding: 24, paddingTop: 90 },
    card: {
      backgroundColor: colors.surface, borderRadius: 20, padding: 20,
      shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 16, shadowOffset: { width: 0, height: 8 },
    },
    title: { fontSize: 26, fontWeight: "800", marginBottom: 18, textAlign: "center", color: colors.textPrimary },
    roleRow: { flexDirection: "row", marginBottom: 14, gap: 10 },
    roleButton: { flex: 1, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: colors.border, alignItems: "center", backgroundColor: colors.background },
    roleButtonActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    roleText: { color: colors.textPrimary, fontWeight: "600" },
    roleTextActive: { color: "#FFFFFF", fontWeight: "700" },
    input: {
      backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, borderRadius: 12,
      padding: 14, fontSize: 16, color: colors.textPrimary, marginBottom: 12,
    },
    sectionLabel: { fontSize: 14, fontWeight: "700", color: colors.textPrimary, marginTop: 6, marginBottom: 2 },
    sectionHint: { fontSize: 12, color: colors.textMuted, marginBottom: 8 },
    uploadBox: {
      height: 120, borderRadius: 12, borderWidth: 1, borderStyle: "dashed", borderColor: colors.border,
      backgroundColor: colors.background, alignItems: "center", justifyContent: "center", marginBottom: 14, overflow: "hidden",
    },
    uploadText: { color: colors.textSecondary, fontWeight: "600" },
    uploadPreview: { width: "100%", height: "100%" },
    primaryButton: { backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 16, alignItems: "center", marginTop: 4 },
    primaryButtonText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
    link: { textAlign: "center", marginTop: 16, color: colors.textSecondary },
    linkBold: { color: colors.primary, fontWeight: "700" },
  });
}
