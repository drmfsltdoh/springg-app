import React, { useEffect, useState } from "react";
import { View, Text, FlatList, StyleSheet } from "react-native";
import { api } from "../../api/api";
import { useTheme } from "../../context/ThemeContext";

export default function HistoryScreen() {
  const { colors, shared, spacing, radius, typography } = useTheme();
  const styles = makeStyles(colors, spacing, radius, typography);
  const STATUS_COLORS = {
    trip_completed: colors.accent,
    payment_completed: colors.accent,
    rated: colors.accent,
    cancelled_by_rider: colors.danger,
    cancelled_by_driver: colors.danger,
    cancelled_for_safety: colors.danger,
    no_driver_found: colors.danger,
  };
  const [trips, setTrips] = useState([]);

  useEffect(() => {
    api.getMyTrips().then(setTrips).catch(() => {});
  }, []);

  return (
    <View style={shared.screen}>
      <View style={styles.content}>
        <Text style={styles.title}>Ride History</Text>
        <FlatList
          data={trips}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={<Text style={styles.empty}>No rides yet.</Text>}
          renderItem={({ item }) => (
            <View style={[shared.card, styles.card]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.route}>{item.pickup_address} → {item.destination_address}</Text>
                <Text style={styles.meta}>{new Date(item.requested_at).toLocaleDateString()}</Text>
              </View>
              <View style={[styles.badge, { backgroundColor: (STATUS_COLORS[item.status] || colors.textMuted) + "22" }]}>
                <Text style={[styles.badgeText, { color: STATUS_COLORS[item.status] || colors.textMuted }]}>{item.status.replace(/_/g, " ")}</Text>
              </View>
            </View>
          )}
        />
      </View>
    </View>
  );
}

function makeStyles(colors, spacing, radius, typography) {
  return StyleSheet.create({
    content: { flex: 1, padding: spacing.lg },
    title: { ...typography.h2, marginBottom: spacing.md, color: colors.textPrimary },
    empty: { textAlign: "center", color: colors.textMuted, marginTop: 30 },
    card: { flexDirection: "row", alignItems: "center", marginBottom: spacing.sm },
    route: { fontSize: 14, fontWeight: "700", color: colors.textPrimary },
    meta: { fontSize: 12, color: colors.textSecondary, marginTop: 4 },
    badge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill },
    badgeText: { fontSize: 11, fontWeight: "700", textTransform: "capitalize" },
  });
}
