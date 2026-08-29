import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from "react-native";
import { api, formatNaira } from "../../api/api";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";
import PlacesAutocomplete from "../../components/PlacesAutocomplete";

export default function RiderHomeScreen({ navigation }) {
  const { user, logout } = useAuth();
  const { colors, shared, spacing, radius, typography, isDark, toggleTheme } = useTheme();
  const styles = makeStyles(colors, spacing, radius, typography);

  const [pickup, setPickup] = useState("");
  const [pickupCoords, setPickupCoords] = useState(null);
  const [destination, setDestination] = useState("");
  const [destinationCoords, setDestinationCoords] = useState(null);
  const [estimate, setEstimate] = useState(null);
  const [loadingEstimate, setLoadingEstimate] = useState(false);
  const [requesting, setRequesting] = useState(false);

  async function getEstimate() {
    if (!pickupCoords || !destinationCoords) {
      return Alert.alert("Pick from the list", "Select pickup and destination from the suggestions so we have exact coordinates");
    }
    setLoadingEstimate(true);
    setEstimate(null);
    try {
      const data = await api.getFareEstimate(
        { lat: pickupCoords.lat, lng: pickupCoords.lng },
        { lat: destinationCoords.lat, lng: destinationCoords.lng }
      );
      setEstimate(data);
    } catch (e) {
      Alert.alert("Could not get a fare estimate", e.message);
    } finally {
      setLoadingEstimate(false);
    }
  }

  async function confirmRide() {
    setRequesting(true);
    try {
      const trip = await api.requestTrip({
        pickup: { lat: pickupCoords.lat, lng: pickupCoords.lng, address: pickup },
        destination: { lat: destinationCoords.lat, lng: destinationCoords.lng, address: destination },
      });
      navigation.navigate("TripStatus", { tripId: trip.id });
    } catch (e) {
      Alert.alert("Request failed", e.message);
    } finally {
      setRequesting(false);
    }
  }

  return (
    <View style={shared.screen}>
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Hey {user.name?.split(" ")[0]} 👋</Text>
          <Text style={styles.title}>Where to?</Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.themeToggle} onPress={toggleTheme}>
            <Text style={styles.themeToggleText}>{isDark ? "☀️" : "🌙"}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={logout}><Text style={styles.logout}>Log out</Text></TouchableOpacity>
        </View>
      </View>

      <View style={styles.content}>
        <View style={[shared.card, styles.searchCard]}>
          <PlacesAutocomplete
            placeholder="Pickup location"
            value={pickup}
            onChangeText={(t) => { setPickup(t); setPickupCoords(null); setEstimate(null); }}
            onSelect={({ address, lat, lng }) => { setPickup(address); setPickupCoords({ lat, lng }); setEstimate(null); }}
            colors={colors}
            radius={radius}
          />
          <View style={styles.divider} />
          <PlacesAutocomplete
            placeholder="Destination"
            value={destination}
            onChangeText={(t) => { setDestination(t); setDestinationCoords(null); setEstimate(null); }}
            onSelect={({ address, lat, lng }) => { setDestination(address); setDestinationCoords({ lat, lng }); setEstimate(null); }}
            colors={colors}
            radius={radius}
          />
        </View>

        {!estimate && (
          <TouchableOpacity style={shared.primaryButton} onPress={getEstimate} disabled={loadingEstimate}>
            {loadingEstimate ? <ActivityIndicator color={colors.white} /> : <Text style={shared.primaryButtonText}>See fare estimate</Text>}
          </TouchableOpacity>
        )}

        {estimate && (
          <View style={[shared.card, styles.estimateCard]}>
            <Text style={styles.estimateTitle}>Fare breakdown</Text>
            <Row label="Base fare" value={formatNaira(estimate.baseFareKobo)} />
            <Row label="Distance" value={formatNaira(estimate.distanceCostKobo)} />
            <Row label="Time" value={formatNaira(estimate.timeCostKobo)} />
            <Row label="Booking fee" value={formatNaira(estimate.bookingFeeKobo)} />
            {estimate.discountKobo > 0 && <Row label="Discount" value={`-${formatNaira(estimate.discountKobo)}`} />}
            <View style={styles.totalDivider} />
            <Row label="Total" value={formatNaira(estimate.totalKobo)} bold />
            <Text style={styles.estimateMeta}>
              ~{estimate.distanceKm.toFixed(1)} km · ~{Math.round(estimate.durationMin)} min
            </Text>

            <TouchableOpacity style={[shared.primaryButton, styles.confirmButton]} onPress={confirmRide} disabled={requesting}>
              {requesting ? <ActivityIndicator color={colors.white} /> : <Text style={shared.primaryButtonText}>Confirm Ride</Text>}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setEstimate(null)}>
              <Text style={styles.editLink}>Edit trip</Text>
            </TouchableOpacity>
          </View>
        )}

        <TouchableOpacity onPress={() => navigation.navigate("History")}>
          <Text style={styles.historyLink}>View ride history</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function Row({ label, value, bold }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 }}>
      <Text style={{ fontSize: bold ? 15 : 13, fontWeight: bold ? "800" : "500", opacity: bold ? 1 : 0.7 }}>{label}</Text>
      <Text style={{ fontSize: bold ? 16 : 13, fontWeight: bold ? "800" : "600" }}>{value}</Text>
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
    searchCard: { marginBottom: spacing.md },
    divider: { height: 1, backgroundColor: colors.border },
    estimateCard: { marginTop: spacing.md },
    estimateTitle: { fontSize: 16, fontWeight: "800", color: colors.textPrimary, marginBottom: spacing.sm },
    totalDivider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.sm },
    estimateMeta: { fontSize: 12, color: colors.textMuted, marginTop: spacing.xs, marginBottom: spacing.md },
    confirmButton: { marginTop: spacing.sm },
    editLink: { textAlign: "center", color: colors.textSecondary, marginTop: spacing.sm, fontWeight: "600" },
    historyLink: { textAlign: "center", color: colors.primary, fontWeight: "700", marginTop: spacing.lg },
  });
}
