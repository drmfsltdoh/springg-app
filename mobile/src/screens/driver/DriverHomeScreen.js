import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, TouchableOpacity, FlatList, StyleSheet, Switch, Alert } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import * as Location from "expo-location";
import { api, formatNaira } from "../../api/api";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";

export default function DriverHomeScreen({ navigation }) {
  const { user, logout } = useAuth();
  const { colors, shared, spacing, radius, typography, isDark, toggleTheme } = useTheme();
  const styles = makeStyles(colors, spacing, radius, typography);

  const [online, setOnline] = useState(false);
  const [requests, setRequests] = useState([]);
  const [verificationStatus, setVerificationStatus] = useState("pending");
  const [wallet, setWallet] = useState(null);
  const watchRef = useRef(null);
  const isVerified = verificationStatus === "approved";

  const loadRequests = useCallback(async () => {
    try {
      const trips = await api.getSearchingTrips();
      setRequests(trips);
    } catch (e) {
      // silent retry
    }
  }, []);

  const loadVerification = useCallback(async () => {
    try {
      const data = await api.getVerificationStatus();
      setVerificationStatus(data.verification_status);
    } catch (e) {
      // silent
    }
  }, []);

  const loadWallet = useCallback(async () => {
    try {
      const data = await api.getDriverWallet();
      setWallet(data);
    } catch (e) {
      // silent
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      const interval = setInterval(() => {
        loadRequests();
        loadVerification();
      }, 3000);
      loadRequests();
      loadVerification();
      loadWallet();
      return () => clearInterval(interval);
    }, [loadRequests, loadVerification, loadWallet])
  );

  useEffect(() => () => { if (watchRef.current) watchRef.current.remove(); }, []);

  async function startBroadcastingLocation() {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Location needed", "Spring needs location access so riders can see you coming.");
      return false;
    }
    watchRef.current = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, timeInterval: 4000, distanceInterval: 10 },
      (pos) => {
        api.setDriverStatus({ online: true, lat: pos.coords.latitude, lng: pos.coords.longitude }).catch(() => {});
      }
    );
    return true;
  }

  async function toggleOnline(value) {
    if (value && !isVerified) {
      return Alert.alert("Verification pending", "You can go online once our team approves your ID verification.");
    }
    if (value) {
      const ok = await startBroadcastingLocation();
      if (!ok) return;
      setOnline(true);
    } else {
      if (watchRef.current) { watchRef.current.remove(); watchRef.current = null; }
      try { await api.setDriverStatus({ online: false }); } catch (e) {}
      setOnline(false);
    }
  }

  async function acceptRequest(trip) {
    try {
      await api.acceptTrip(trip.id);
      navigation.navigate("DriverTrip", { tripId: trip.id });
    } catch (e) {
      Alert.alert("Could not accept", e.message);
      loadRequests();
    }
  }

  return (
    <View style={shared.screen}>
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Hey {user.name?.split(" ")[0]} 👋</Text>
          <Text style={styles.title}>Driver Portal</Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.themeToggle} onPress={toggleTheme}>
            <Text style={styles.themeToggleText}>{isDark ? "☀️" : "🌙"}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={logout}><Text style={styles.logout}>Log out</Text></TouchableOpacity>
        </View>
      </View>

      <View style={styles.content}>
        {!isVerified && (
          <View style={[shared.card, styles.verifyBanner]}>
            <Text style={styles.verifyTitle}>
              {verificationStatus === "rejected" ? "⚠️ Verification not approved" : "⏳ ID verification pending"}
            </Text>
            <Text style={styles.verifyBody}>
              {verificationStatus === "rejected"
                ? "Our team couldn't verify your documents. Contact support to resubmit."
                : "Our team is reviewing your documents. You'll be able to go online once approved."}
            </Text>
          </View>
        )}

        {wallet && (
          <View style={[shared.card, styles.walletCard]}>
            <Text style={styles.walletLabel}>Wallet balance</Text>
            <Text style={styles.walletValue}>{formatNaira(wallet.balance)}</Text>
          </View>
        )}

        <View style={[shared.card, styles.statusRow]}>
          <View style={styles.statusDotRow}>
            <View style={[styles.dot, { backgroundColor: online ? colors.accent : colors.textMuted }]} />
            <Text style={styles.statusLabel}>{online ? "You're Online" : "You're Offline"}</Text>
          </View>
          <Switch value={online} onValueChange={toggleOnline} trackColor={{ false: colors.border, true: colors.accentSoft }} thumbColor={online ? colors.accent : "#fff"} />
        </View>

        <TouchableOpacity style={styles.radioButton} onPress={() => navigation.navigate("Radio")}>
          <Text style={styles.radioButtonText}>🎵  Open Radio Player</Text>
        </TouchableOpacity>

        <Text style={styles.subtitle}>Incoming Requests ({requests.length})</Text>

        <FlatList
          data={requests}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: 20 }}
          ListEmptyComponent={<Text style={styles.empty}>{online ? "No requests yet. Waiting for riders..." : "Go online to start receiving requests."}</Text>}
          renderItem={({ item }) => (
            <View style={[shared.card, styles.requestCard]}>
              <Text style={styles.riderName}>{item.rider_name}</Text>
              <Text style={styles.route}>{item.pickup_address}  →  {item.destination_address}</Text>
              <TouchableOpacity style={styles.acceptButton} onPress={() => acceptRequest(item)}>
                <Text style={styles.acceptButtonText}>Accept</Text>
              </TouchableOpacity>
            </View>
          )}
        />
      </View>
    </View>
  );
}

function makeStyles(colors, spacing, radius, typography) {
  return StyleSheet.create({
    header: {
      flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end",
      paddingHorizontal: spacing.lg, paddingTop: 60, paddingBottom: spacing.md,
      backgroundColor: colors.primary, borderBottomLeftRadius: radius.lg, borderBottomRightRadius: radius.lg,
    },
    greeting: { color: "#E4DFFF", fontSize: 13, marginBottom: 2 },
    title: { color: colors.white, ...typography.h2 },
    headerActions: { flexDirection: "row", alignItems: "center", gap: 12 },
    themeToggle: { width: 32, height: 32, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" },
    themeToggleText: { fontSize: 14 },
    logout: { color: "#D8CFFF", fontWeight: "600" },
    content: { flex: 1, padding: spacing.lg },
    verifyBanner: { marginBottom: spacing.md, backgroundColor: colors.accentSoft, borderColor: colors.accent },
    verifyTitle: { fontWeight: "800", color: colors.textPrimary, marginBottom: 4 },
    verifyBody: { color: colors.textSecondary, fontSize: 13, lineHeight: 18 },
    walletCard: { marginBottom: spacing.md, alignItems: "center" },
    walletLabel: { fontSize: 12, color: colors.textSecondary },
    walletValue: { fontSize: 24, fontWeight: "800", color: colors.primary, marginTop: 2 },
    statusRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.md },
    statusDotRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    dot: { width: 10, height: 10, borderRadius: 5 },
    statusLabel: { fontSize: 16, fontWeight: "700", color: colors.textPrimary },
    radioButton: { backgroundColor: colors.accentSoft, padding: 14, borderRadius: radius.md, alignItems: "center", marginBottom: spacing.lg },
    radioButtonText: { fontSize: 15, fontWeight: "700", color: colors.primaryDark },
    subtitle: { fontSize: 16, fontWeight: "700", marginBottom: spacing.sm, color: colors.textPrimary },
    empty: { textAlign: "center", color: colors.textMuted, marginTop: 30 },
    requestCard: { marginBottom: spacing.sm },
    riderName: { fontSize: 15, fontWeight: "700", color: colors.textPrimary },
    route: { fontSize: 14, color: colors.textSecondary, marginTop: 4, marginBottom: 12 },
    acceptButton: { backgroundColor: colors.primary, padding: 10, borderRadius: radius.sm, alignItems: "center" },
    acceptButtonText: { color: colors.white, fontWeight: "700" },
  });
}
