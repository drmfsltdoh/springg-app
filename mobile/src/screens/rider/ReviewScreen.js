import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from "react-native";
import { api } from "../../api/api";
import { useTheme } from "../../context/ThemeContext";

const TAGS = ["Respectful", "Safe driving", "Clean vehicle", "Good communication", "Arrived on time"];

export default function ReviewScreen({ route, navigation }) {
  const { tripId, driverUserId, driverName } = route.params;
  const { colors, shared, spacing, radius, typography } = useTheme();
  const styles = makeStyles(colors, spacing, radius, typography);

  const [rating, setRating] = useState(0);
  const [selectedTags, setSelectedTags] = useState([]);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function toggleTag(tag) {
    setSelectedTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  }

  async function submit() {
    if (rating === 0) return Alert.alert("Pick a rating", "Tap a star to rate your trip");
    setSubmitting(true);
    try {
      await api.submitRating({ tripId, toUserId: driverUserId, stars: rating, tags: selectedTags, comment });
      Alert.alert("Thanks!", "Your review has been submitted.", [{ text: "OK", onPress: () => navigation.navigate("RiderHome") }]);
    } catch (e) {
      Alert.alert("Error", e.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={shared.screen}>
      <View style={styles.content}>
        <Text style={styles.title}>How was your trip?</Text>
        <Text style={styles.subtitle}>Rate your ride with {driverName}</Text>

        <View style={styles.stars}>
          {[1, 2, 3, 4, 5].map((n) => (
            <TouchableOpacity key={n} onPress={() => setRating(n)}>
              <Text style={[styles.star, n <= rating && styles.starActive]}>★</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.tagRow}>
          {TAGS.map((tag) => (
            <TouchableOpacity key={tag} style={[styles.tag, selectedTags.includes(tag) && styles.tagActive]} onPress={() => toggleTag(tag)}>
              <Text style={[styles.tagText, selectedTags.includes(tag) && styles.tagTextActive]}>{tag}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <TextInput style={[shared.input, styles.commentBox]} placeholder="Leave a comment (optional)" placeholderTextColor={colors.textMuted} value={comment} onChangeText={setComment} multiline />

        <TouchableOpacity style={shared.primaryButton} onPress={submit} disabled={submitting}>
          <Text style={shared.primaryButtonText}>{submitting ? "Submitting..." : "Submit Review"}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.skip} onPress={() => navigation.navigate("RiderHome")}>
          <Text style={styles.skipText}>Skip for now</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function makeStyles(colors, spacing, radius, typography) {
  return StyleSheet.create({
    content: { flex: 1, padding: spacing.lg, paddingTop: 70, alignItems: "center" },
    title: { ...typography.h1, color: colors.textPrimary, textAlign: "center" },
    subtitle: { color: colors.textSecondary, marginTop: 6, marginBottom: spacing.lg, textAlign: "center" },
    stars: { flexDirection: "row", gap: 8, marginBottom: spacing.lg },
    star: { fontSize: 40, color: colors.border },
    starActive: { color: colors.warning },
    tagRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "center", marginBottom: spacing.lg },
    tag: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 8 },
    tagActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    tagText: { color: colors.textSecondary, fontSize: 13, fontWeight: "600" },
    tagTextActive: { color: colors.white },
    commentBox: { width: "100%", minHeight: 70, textAlignVertical: "top", marginBottom: spacing.lg },
    skip: { marginTop: spacing.md },
    skipText: { color: colors.textMuted, fontWeight: "600" },
  });
}
