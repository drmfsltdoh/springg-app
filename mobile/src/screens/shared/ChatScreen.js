import React, { useCallback, useRef, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, KeyboardAvoidingView, Platform } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { api } from "../../api/api";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";

export default function ChatScreen({ route }) {
  const { tripId, otherPartyName } = route.params;
  const { user } = useAuth();
  const { colors, shared, spacing, radius } = useTheme();
  const styles = makeStyles(colors, spacing, radius);

  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef(null);

  const loadMessages = useCallback(async () => {
    try {
      const msgs = await api.getMessages(tripId);
      setMessages(msgs);
    } catch (e) {
      // silent retry
    }
  }, [tripId]);

  useFocusEffect(
    useCallback(() => {
      const interval = setInterval(loadMessages, 2500);
      loadMessages();
      return () => clearInterval(interval);
    }, [loadMessages])
  );

  async function handleSend() {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setText("");
    try {
      await api.sendMessage(tripId, trimmed);
      await loadMessages();
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (e) {
      setText(trimmed);
    } finally {
      setSending(false);
    }
  }

  return (
    <KeyboardAvoidingView style={shared.screen} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={90}>
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.list}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        renderItem={({ item }) => {
          const isMine = item.sender_role === user.role;
          return (
            <View style={[styles.bubbleRow, isMine ? styles.bubbleRowMine : styles.bubbleRowTheirs]}>
              <View style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleTheirs]}>
                <Text style={[styles.bubbleText, isMine && styles.bubbleTextMine]}>{item.body}</Text>
                <Text style={[styles.time, isMine && styles.timeMine]}>
                  {new Date(item.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </Text>
              </View>
            </View>
          );
        }}
        ListEmptyComponent={<Text style={styles.empty}>No messages yet. Say hi to {otherPartyName}!</Text>}
      />

      <View style={styles.inputBar}>
        <TextInput
          style={styles.input}
          placeholder={`Message ${otherPartyName}...`}
          placeholderTextColor={colors.textMuted}
          value={text}
          onChangeText={setText}
          multiline
        />
        <TouchableOpacity style={styles.sendButton} onPress={handleSend} disabled={sending || !text.trim()}>
          <Text style={styles.sendButtonText}>➤</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

function makeStyles(colors, spacing, radius) {
  return StyleSheet.create({
    list: { padding: spacing.md, flexGrow: 1 },
    empty: { textAlign: "center", color: colors.textMuted, marginTop: 40 },
    bubbleRow: { flexDirection: "row", marginBottom: spacing.sm },
    bubbleRowMine: { justifyContent: "flex-end" },
    bubbleRowTheirs: { justifyContent: "flex-start" },
    bubble: { maxWidth: "78%", borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 10 },
    bubbleMine: { backgroundColor: colors.primary, borderBottomRightRadius: 4 },
    bubbleTheirs: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderBottomLeftRadius: 4 },
    bubbleText: { fontSize: 15, color: colors.textPrimary },
    bubbleTextMine: { color: colors.white },
    time: { fontSize: 10, color: colors.textMuted, marginTop: 4, alignSelf: "flex-end" },
    timeMine: { color: "#E4DFFF" },
    inputBar: { flexDirection: "row", alignItems: "flex-end", padding: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface },
    input: { flex: 1, backgroundColor: colors.background, borderRadius: radius.lg, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, color: colors.textPrimary, maxHeight: 100, marginRight: spacing.sm },
    sendButton: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
    sendButtonText: { color: colors.white, fontSize: 18, fontWeight: "700" },
  });
}
