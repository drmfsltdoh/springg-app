import React, { useEffect, useRef, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Alert } from "react-native";
import * as Location from "expo-location";
import { api, formatNaira } from "../../api/api";
import { useTheme } from "../../context/ThemeContext";

// Walks the driver through the real trip state machine, one step at a time —
// matches exactly what the backend will and won't allow (utils/tripStateMachine.js).
const NEXT_STATUS = {
  driver_accepted: "driver_en_route_to_pickup",
  driver_en_route_to_pickup: "driver_arrived",
  driver_arrived: "rider_onboard",
  rider_onboard: "trip_started",
};
const BUTTON_LABEL = {
  driver_accepted: "Start Navigating to Pickup",
  driver_en_route_to_pickup: "I've Arrived",
  driver_arrived: "Rider is Onboard",
  rider_onboard: "Start Trip",
};

export default function DriverTripScreen({ route, navigation }) {
  const { tripId } = route.params;
  const { colors, shared, spacing, radius } = useTheme();
  const styles = makeStyles(colors, spacing, radius);

  const [trip, setTrip] = useState(null);
  const [distanceKm, setDistanceKm] = useState(0);
  const watchRef = useRef(null);
  const lastPointRef = useRef(null);
  const startPointRef = useRef(null);
  const startTimeRef = useRef(null);

  useEffect(() => {
    loadTrip();
  }, []);

  async function loadTrip() {
    try {
      const data = await api.getTrip(tripId);
      setTrip(data.trip);
    } catch (e) {
      Alert.alert("Error", "Could not load trip");
    }
  }

  useEffect(() => {
    if (trip?.status !== "trip_started") return;
    startTimeRef.current = Date.now();

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;
      watchRef.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: 3000, distanceInterval: 5 },
        (pos) => {
          const point = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          if (!startPointRef.current) startPointRef.current = point;
          if (lastPointRef.current) {
            const R = 6371;
            const dLat = ((point.lat - lastPointRef.current.lat) * Math.PI) / 180;
            const dLng = ((point.lng - lastPointRef.current.lng) * Math.PI) / 180;
            const a = Math.sin(dLat / 2) ** 2 + Math.cos((lastPointRef.current.lat * Math.PI) / 180) *
              Math.cos((point.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
            const delta = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            if (delta > 0.005) setDistanceKm((prev) => prev + delta);
          }
          lastPointRef.current = point;
        }
      );
    })();

    return () => { if (watchRef.current) { watchRef.current.remove(); watchRef.current = null; } };
  }, [trip?.status]);

  async function advance() {
    const next = NEXT_STATUS[trip.status];
    if (!next) return;
    try {
      await api.transitionTrip(tripId, next);
      setTrip({ ...trip, status: next });
    } catch (e) {
      Alert.alert("Error", e.message);
    }
  }

  async function completeTrip() {
    const durationMin = startTimeRef.current ? (Date.now() - startTimeRef.current) / 60000 : 1;
    try {
      const result = await api.completeTrip(tripId, { actualDistanceKm: distanceKm || 0.1, actualDurationMin: durationMin });
      Alert.alert("Trip completed!", `Your earnings: ${formatNaira(result.fareBreakdown.driverEarningsKobo)}`, [
        { text: "OK", onPress: () => navigation.replace("DriverHome") },
      ]);
    } catch (e) {
      Alert.alert("Error", e.message);
    }
  }

  if (!trip) return <View style={shared.screen} />;

  return (
    <View style={shared.screen}>
      <View style={styles.content}>
        <Text style={styles.label}>Current trip</Text>
        <View style={[shared.card, styles.card]}>
          <View style={styles.riderCardRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.riderName}>{trip.rider_name}</Text>
              <Text style={styles.route}>{trip.pickup_address} → {trip.destination_address}</Text>
              <View style={styles.statusPill}><Text style={styles.statusPillText}>{trip.status.replace(/_/g, " ")}</Text></View>
            </View>
            <TouchableOpacity style={styles.messageButton} onPress={() => navigation.navigate("Chat", { tripId, otherPartyName: trip.rider_name })}>
              <Text style={styles.messageButtonText}>💬 Message</Text>
            </TouchableOpacity>
          </View>
        </View>

        {trip.status === "trip_started" && (
          <View style={styles.meterCard}>
            <Text style={styles.meterLabel}>Distance covered</Text>
            <Text style={styles.meterValue}>{distanceKm.toFixed(1)} km</Text>
          </View>
        )}

        {trip.status === "trip_started" ? (
          <TouchableOpacity style={shared.primaryButton} onPress={completeTrip}>
            <Text style={shared.primaryButtonText}>Complete Trip</Text>
          </TouchableOpacity>
        ) : BUTTON_LABEL[trip.status] ? (
          <TouchableOpacity style={shared.primaryButton} onPress={advance}>
            <Text style={shared.primaryButtonText}>{BUTTON_LABEL[trip.status]}</Text>
          </TouchableOpacity>
        ) : null}

        <TouchableOpacity style={styles.radioButton} onPress={() => navigation.navigate("Radio")}>
          <Text style={styles.radioButtonText}>🎵  Open Radio Player</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function makeStyles(colors, spacing, radius) {
  return StyleSheet.create({
    content: { flex: 1, padding: spacing.lg, paddingTop: 60 },
    label: { fontSize: 13, color: colors.textMuted, marginBottom: spacing.sm },
    card: { marginBottom: spacing.lg },
    riderCardRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    messageButton: { backgroundColor: colors.primary, paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.sm },
    messageButtonText: { color: colors.white, fontWeight: "700", fontSize: 12 },
    riderName: { fontSize: 18, fontWeight: "700", color: colors.textPrimary },
    route: { fontSize: 15, color: colors.textSecondary, marginTop: 6 },
    statusPill: { alignSelf: "flex-start", backgroundColor: colors.accentSoft, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4, marginTop: 12 },
    statusPillText: { color: colors.primaryDark, fontWeight: "700", fontSize: 12, textTransform: "capitalize" },
    meterCard: { backgroundColor: colors.accentSoft, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.lg, alignItems: "center" },
    meterLabel: { fontSize: 12, color: colors.textSecondary, marginBottom: 4 },
    meterValue: { fontSize: 22, fontWeight: "800", color: colors.textPrimary },
    radioButton: { backgroundColor: colors.accentSoft, padding: 14, borderRadius: radius.md, alignItems: "center", marginTop: spacing.sm },
    radioButtonText: { fontSize: 15, fontWeight: "700", color: colors.primaryDark },
  });
}
