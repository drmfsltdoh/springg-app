import React, { useEffect, useRef, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { Audio } from "expo-av";
import { useTheme } from "../../context/ThemeContext";

const STATIONS = [
  { id: "groove", name: "Groove Salad (Chill)", url: "https://ice1.somafm.com/groovesalad-128-mp3" },
  { id: "indie", name: "Indie Pop Rocks", url: "https://ice1.somafm.com/indiepop-128-mp3" },
  { id: "beat", name: "Beat Blender (Lounge)", url: "https://ice1.somafm.com/beatblender-128-mp3" },
  { id: "lush", name: "Lush (Vocal Chillout)", url: "https://ice1.somafm.com/lush-128-mp3" },
];

export default function RadioPlayerScreen() {
  const { colors, shared, spacing, radius, typography } = useTheme();
  const styles = makeStyles(colors, spacing, radius, typography);

  const soundRef = useRef(null);
  const [activeStation, setActiveStation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    Audio.setAudioModeAsync({ staysActiveInBackground: true, playsInSilentModeIOS: true });
    return () => {
      if (soundRef.current) soundRef.current.unloadAsync();
    };
  }, []);

  async function playStation(station) {
    setLoading(true);
    try {
      if (soundRef.current) {
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }
      const { sound } = await Audio.Sound.createAsync({ uri: station.url }, { shouldPlay: true });
      soundRef.current = sound;
      setActiveStation(station);
      setIsPlaying(true);
    } catch (e) {
      // Stream failed to load
    } finally {
      setLoading(false);
    }
  }

  async function togglePlayPause() {
    if (!soundRef.current) return;
    if (isPlaying) await soundRef.current.pauseAsync();
    else await soundRef.current.playAsync();
    setIsPlaying(!isPlaying);
  }

  async function stop() {
    if (soundRef.current) {
      await soundRef.current.unloadAsync();
      soundRef.current = null;
    }
    setActiveStation(null);
    setIsPlaying(false);
  }

  return (
    <View style={shared.screen}>
      <View style={styles.content}>
        <Text style={styles.title}>🎵 Drive Radio</Text>
        <Text style={styles.subtitle}>Pick a station to play while you drive</Text>

        {STATIONS.map((station) => {
          const active = activeStation?.id === station.id;
          return (
            <TouchableOpacity
              key={station.id}
              style={[shared.card, styles.stationCard, active && styles.stationCardActive]}
              onPress={() => playStation(station)}
            >
              <Text style={[styles.stationName, active && styles.stationNameActive]}>{station.name}</Text>
              {active && loading && <ActivityIndicator color={colors.white} />}
              {active && !loading && <Text style={styles.playingDot}>{isPlaying ? "▶" : "❚❚"}</Text>}
            </TouchableOpacity>
          );
        })}

        {activeStation && (
          <View style={[shared.card, styles.nowPlaying]}>
            <Text style={styles.nowPlayingText}>Now playing: {activeStation.name}</Text>
            <View style={styles.controls}>
              <TouchableOpacity style={styles.controlButton} onPress={togglePlayPause}>
                <Text style={styles.controlText}>{isPlaying ? "Pause" : "Play"}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.controlButton, styles.stopButton]} onPress={stop}>
                <Text style={styles.controlText}>Stop</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

function makeStyles(colors, spacing, radius, typography) {
  return StyleSheet.create({
    content: { flex: 1, padding: spacing.lg, paddingTop: 60 },
    title: { ...typography.h1, color: colors.textPrimary, marginBottom: 4 },
    subtitle: { fontSize: 14, color: colors.textMuted, marginBottom: spacing.lg },
    stationCard: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.sm },
    stationCardActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    stationName: { fontSize: 15, fontWeight: "700", color: colors.textPrimary },
    stationNameActive: { color: colors.white },
    playingDot: { color: colors.white, fontSize: 14 },
    nowPlaying: { marginTop: spacing.md },
    nowPlayingText: { fontSize: 14, fontWeight: "700", color: colors.textPrimary, marginBottom: spacing.sm },
    controls: { flexDirection: "row", gap: 10 },
    controlButton: { flex: 1, backgroundColor: colors.primary, padding: 12, borderRadius: radius.sm, alignItems: "center" },
    stopButton: { backgroundColor: colors.textMuted },
    controlText: { color: colors.white, fontWeight: "700" },
  });
}
