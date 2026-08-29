import React, { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from "react-native";
import MapView, { Marker, Polyline } from "react-native-maps";
import * as Location from "expo-location";
import { api, formatNaira } from "../../api/api";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";

const STATUS_LABEL = {
  requested: "Setting up your request...",
  searching_for_driver: "Looking for a nearby driver...",
  driver_assigned: "Driver assigned!",
  driver_accepted: "Driver accepted your ride!",
  driver_en_route_to_pickup: "Your driver is on the way!",
  driver_arrived: "Your driver has arrived",
  rider_onboard: "Enjoy your trip",
  trip_started: "Trip in progress",
  trip_completed: "Trip completed",
  cancelled_by_rider: "You cancelled this trip",
  cancelled_by_driver: "Driver cancelled this trip",
  cancelled_for_safety: "Trip cancelled for safety reasons",
  no_driver_found: "No driver was found",
};

export default function TripStatusScreen({ route, navigation }) {
  const { tripId } = route.params;
  const { user } = useAuth();
  const { colors, shared, spacing, radius, typography } = useTheme();
  const styles = makeStyles(colors, spacing, radius, typography);

  const [trip, setTrip] = useState(null);
  const [fareBreakdown, setFareBreakdown] = useState(null);
  const [riderLocation, setRiderLocation] = useState(null);
  const [routeCoords, setRouteCoords] = useState([]);
  const lastRouteKeyRef = useRef(null);

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === "granted") {
        const pos = await Location.getCurrentPositionAsync({});
        setRiderLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      }
    })();
  }, []);

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const data = await api.getTrip(tripId);
        setTrip(data.trip);
        if (data.fareBreakdown) setFareBreakdown(data.fareBreakdown);
      } catch (e) {
        // silent retry
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [tripId]);

  // Draw the route: driver -> pickup while en route, driver -> destination
  // once the trip has started. Uses our own backend's /places/route, which
  // is backed by free OSM/OSRM — no Google Maps key needed anywhere.
  useEffect(() => {
    if (!trip?.driver_lat || !trip?.driver_lng) return;
    const target = trip.status === "trip_started"
      ? { lat: trip.destination_lat, lng: trip.destination_lng }
      : { lat: trip.pickup_lat, lng: trip.pickup_lng };

    const key = `${trip.driver_lat.toFixed(4)},${trip.driver_lng.toFixed(4)}->${target.lat},${target.lng}->${trip.status}`;
    if (lastRouteKeyRef.current === key) return;
    lastRouteKeyRef.current = key;

    api.getRoute({ lat: trip.driver_lat, lng: trip.driver_lng }, target)
      .then((data) => setRouteCoords(data.coordinates))
      .catch(() => {});
  }, [trip?.driver_lat, trip?.driver_lng, trip?.status]);

  if (!trip) {
    return (
      <View style={[shared.screen, { alignItems: "center", justifyContent: "center" }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const showMap = trip.driver_lat && trip.driver_lng;
  const isCancellable = ["requested", "searching_for_driver", "driver_assigned", "driver_accepted", "driver_en_route_to_pickup"].includes(trip.status);

  async function handleCancel() {
    Alert.alert("Cancel this ride?", "A cancellation fee may apply depending on how far along the driver was.", [
      { text: "No, keep it", style: "cancel" },
      { text: "Yes, cancel", style: "destructive", onPress: doCancel },
    ]);
  }

  async function doCancel() {
    try {
      await api.cancelTrip(tripId, "rider_changed_mind");
      navigation.replace("RiderHome");
    } catch (e) {
      Alert.alert("Could not cancel", e.message);
    }
  }

  return (
    <View style={shared.screen}>
      {showMap ? (
        <MapView
          style={styles.map}
          initialRegion={{ latitude: trip.driver_lat, longitude: trip.driver_lng, latitudeDelta: 0.03, longitudeDelta: 0.03 }}
        >
          <Marker coordinate={{ latitude: trip.driver_lat, longitude: trip.driver_lng }} title={trip.driver_name || "Driver"} pinColor={colors.primary} />
          <Marker coordinate={{ latitude: trip.pickup_lat, longitude: trip.pickup_lng }} title="Pickup" pinColor={colors.accent} />
          {trip.status === "trip_started" && (
            <Marker coordinate={{ latitude: trip.destination_lat, longitude: trip.destination_lng }} title="Destination" pinColor={colors.danger} />
          )}
          {routeCoords.length > 0 && <Polyline coordinates={routeCoords} strokeColor={colors.primary} strokeWidth={4} />}
        </MapView>
      ) : (
        <View style={[styles.map, styles.mapPlaceholder]}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.mapPlaceholderText}>Looking for a driver nearby...</Text>
        </View>
      )}

      <View style={styles.sheet}>
        <Text style={styles.status}>{STATUS_LABEL[trip.status] || trip.status}</Text>

        {trip.driver_name && (
          <View style={[shared.card, styles.driverCard]}>
            <View style={styles.driverCardRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.driverName}>{trip.driver_name}</Text>
                <Text style={styles.driverMeta}>{trip.vehicle_make} {trip.vehicle_model} • {trip.vehicle_plate}</Text>
                <Text style={styles.driverMeta}>⭐ {Number(trip.driver_rating || 5).toFixed(1)}</Text>
              </View>
              <TouchableOpacity style={styles.messageButton} onPress={() => navigation.navigate("Chat", { tripId, otherPartyName: trip.driver_name })}>
                <Text style={styles.messageButtonText}>💬 Message</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {trip.status === "searching_for_driver" && (
          <TouchableOpacity style={styles.gameButton} onPress={() => navigation.navigate("WaitGame")}>
            <Text style={styles.gameButtonText}>🎮  Play a game while you wait</Text>
          </TouchableOpacity>
        )}

        {trip.status === "trip_completed" && fareBreakdown && (
          <View style={[shared.card, styles.finalFareCard]}>
            <Text style={styles.finalFareLabel}>Total fare</Text>
            <Text style={styles.finalFareValue}>{formatNaira(fareBreakdown.total)}</Text>
          </View>
        )}

        {trip.status === "trip_completed" && (
          <TouchableOpacity style={shared.primaryButton} onPress={() => navigation.replace("Review", { tripId, driverUserId: trip.driver_id, driverName: trip.driver_name })}>
            <Text style={shared.primaryButtonText}>Rate Your Trip</Text>
          </TouchableOpacity>
        )}

        {trip.status.startsWith("cancelled") || trip.status === "no_driver_found" ? (
          <TouchableOpacity style={shared.primaryButton} onPress={() => navigation.replace("RiderHome")}>
            <Text style={shared.primaryButtonText}>Back to Home</Text>
          </TouchableOpacity>
        ) : isCancellable ? (
          <TouchableOpacity style={styles.cancelButton} onPress={handleCancel}>
            <Text style={styles.cancelButtonText}>Cancel ride</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

function makeStyles(colors, spacing, radius, typography) {
  return StyleSheet.create({
    map: { width: "100%", height: "42%" },
    mapPlaceholder: { backgroundColor: colors.border, alignItems: "center", justifyContent: "center", gap: 10 },
    mapPlaceholderText: { color: colors.textMuted },
    sheet: { flex: 1, backgroundColor: colors.surface, padding: spacing.lg, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, marginTop: -20 },
    status: { ...typography.h2, color: colors.textPrimary, marginBottom: spacing.md, textAlign: "center" },
    driverCard: { marginBottom: spacing.md },
    driverCardRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    messageButton: { backgroundColor: colors.accentSoft, paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.sm },
    messageButtonText: { color: colors.primaryDark, fontWeight: "700", fontSize: 12 },
    driverName: { fontSize: 18, fontWeight: "700", color: colors.textPrimary },
    driverMeta: { fontSize: 14, color: colors.textSecondary, marginTop: 4 },
    gameButton: { backgroundColor: colors.accentSoft, borderRadius: radius.md, padding: 14, alignItems: "center", marginBottom: spacing.md },
    gameButtonText: { color: colors.primaryDark, fontWeight: "700" },
    finalFareCard: { alignItems: "center", marginBottom: spacing.md },
    finalFareLabel: { fontSize: 13, color: colors.textSecondary, marginBottom: 4 },
    finalFareValue: { fontSize: 28, fontWeight: "800", color: colors.primary },
    cancelButton: { alignItems: "center", padding: spacing.md },
    cancelButtonText: { color: colors.danger, fontWeight: "700" },
  });
}
