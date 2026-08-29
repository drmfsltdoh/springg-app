import React, { useEffect, useRef, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Animated } from "react-native";
import { useTheme } from "../../context/ThemeContext";

const GAME_DURATION = 20; // seconds
const TARGET_SIZE = 64;

export default function WaitGameScreen({ navigation }) {
  const { colors, shared, spacing, radius, typography } = useTheme();
  const styles = makeStyles(colors, spacing, radius, typography);

  const [running, setRunning] = useState(false);
  const [timeLeft, setTimeLeft] = useState(GAME_DURATION);
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [targetPos, setTargetPos] = useState({ top: 200, left: 100 });
  const bounce = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!running) return;
    if (timeLeft <= 0) {
      setRunning(false);
      setBest((b) => Math.max(b, score));
      return;
    }
    const t = setTimeout(() => setTimeLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [running, timeLeft]);

  function startGame() {
    setScore(0);
    setTimeLeft(GAME_DURATION);
    setRunning(true);
    moveTarget();
  }

  function moveTarget() {
    const top = 120 + Math.random() * 380;
    const left = 20 + Math.random() * 260;
    setTargetPos({ top, left });
  }

  function onTap() {
    if (!running) return;
    setScore((s) => s + 1);
    Animated.sequence([
      Animated.timing(bounce, { toValue: 0.7, duration: 80, useNativeDriver: true }),
      Animated.timing(bounce, { toValue: 1, duration: 80, useNativeDriver: true }),
    ]).start();
    moveTarget();
  }

  return (
    <View style={shared.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>Tap Dash</Text>
        <Text style={styles.subtitle}>Tap the dot as many times as you can before your ride arrives!</Text>
      </View>

      <View style={styles.statsRow}>
        <View style={[shared.card, styles.statBox]}>
          <Text style={styles.statLabel}>Score</Text>
          <Text style={styles.statValue}>{score}</Text>
        </View>
        <View style={[shared.card, styles.statBox]}>
          <Text style={styles.statLabel}>Time</Text>
          <Text style={styles.statValue}>{timeLeft}s</Text>
        </View>
        <View style={[shared.card, styles.statBox]}>
          <Text style={styles.statLabel}>Best</Text>
          <Text style={styles.statValue}>{best}</Text>
        </View>
      </View>

      <View style={styles.playArea}>
        {running ? (
          <Animated.View style={[styles.target, { top: targetPos.top, left: targetPos.left, transform: [{ scale: bounce }] }]}>
            <TouchableOpacity style={styles.targetTouchable} onPress={onTap} activeOpacity={0.8} />
          </Animated.View>
        ) : (
          <View style={styles.startOverlay}>
            <Text style={styles.startText}>{timeLeft === 0 ? `Time's up! Score: ${score}` : "Ready to play?"}</Text>
            <TouchableOpacity style={shared.primaryButton} onPress={startGame}>
              <Text style={shared.primaryButtonText}>{timeLeft === 0 ? "Play Again" : "Start"}</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
        <Text style={styles.backButtonText}>Back to trip status</Text>
      </TouchableOpacity>
    </View>
  );
}

function makeStyles(colors, spacing, radius, typography) {
  return StyleSheet.create({
    header: { padding: spacing.lg, paddingTop: 60 },
    title: { ...typography.h1, color: colors.textPrimary },
    subtitle: { color: colors.textSecondary, marginTop: 4 },
    statsRow: { flexDirection: "row", gap: 10, paddingHorizontal: spacing.lg, marginBottom: spacing.md },
    statBox: { flex: 1, alignItems: "center", paddingVertical: spacing.sm },
    statLabel: { fontSize: 12, color: colors.textMuted, marginBottom: 2 },
    statValue: { fontSize: 20, fontWeight: "800", color: colors.primary },
    playArea: { flex: 1, marginHorizontal: spacing.lg, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: "hidden" },
    target: { position: "absolute", width: TARGET_SIZE, height: TARGET_SIZE },
    targetTouchable: { width: TARGET_SIZE, height: TARGET_SIZE, borderRadius: TARGET_SIZE / 2, backgroundColor: colors.accent },
    startOverlay: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md, padding: spacing.lg },
    startText: { fontSize: 16, fontWeight: "600", color: colors.textPrimary, textAlign: "center" },
    backButton: { alignItems: "center", padding: spacing.lg },
    backButtonText: { color: colors.textSecondary, fontWeight: "600" },
  });
}
