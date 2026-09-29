/**
 * Ask about the shop, in plain words.
 *
 * The same copilot the website carries. The whole conversation goes back each
 * turn because the server keeps none of it, and the suggestions under the box
 * exist because a blank prompt on a phone is a prompt nobody uses.
 */
import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { ApiError } from "@/api/client";
import { ask, type ChatTurn } from "@/api/copilot";
import { Icon } from "@/ui/Icon";
import { palette, radius, space, type } from "@/ui/theme";

const SUGGESTIONS = [
  "What should I do today?",
  "How were sales this week?",
  "Which print jobs are waiting?",
];

export function AskStore({ enabled }: { enabled: boolean }) {
  const [draft, setDraft] = useState("");
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    const next: ChatTurn[] = [...turns, { role: "user", content: q }];
    setTurns(next);
    setDraft("");
    setBusy(true);
    setError(null);
    try {
      const reply = await ask(next);
      setTurns([...next, { role: "assistant", content: reply || "No answer came back." }]);
    } catch (e) {
      // The unanswered question comes back off, so retrying does not send it twice.
      setTurns(turns);
      setDraft(q);
      setError(
        e instanceof ApiError && e.status === 503
          ? "The assistant is not switched on for this shop."
          : e instanceof ApiError && e.message ? e.message
          : "Could not reach the assistant.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={s.card}>
      <View style={s.head}>
        <Icon name="chatbubble-ellipses-outline" tint="blue" size={15} />
        <Text style={s.eyebrow}>ASK YOUR STORE</Text>
      </View>
      <Text style={s.title}>Ask anything about your store</Text>

      {turns.length > 0 ? (
        <ScrollView style={s.thread} nestedScrollEnabled>
          {turns.map((t, i) => (
            <View key={i} style={[s.turn, t.role === "user" ? s.turnUser : s.turnBot]}>
              <Text style={[s.turnText, t.role === "user" && s.turnTextUser]}>{t.content}</Text>
            </View>
          ))}
        </ScrollView>
      ) : null}

      <View style={s.inputRow}>
        <TextInput
          style={s.input}
          value={draft}
          onChangeText={setDraft}
          placeholder="Ask about orders, sales, print jobs..."
          placeholderTextColor={palette.muted}
          editable={!busy}
          onSubmitEditing={() => send(draft)}
          returnKeyType="send"
          multiline
        />
        <Pressable
          onPress={() => send(draft)}
          disabled={busy || !draft.trim()}
          style={({ pressed }) => [
            s.askButton,
            (!draft.trim() || busy) && s.askButtonOff,
            pressed && { opacity: 0.7 },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Ask"
        >
          {busy
            ? <ActivityIndicator size="small" color="#fff" />
            : <Ionicons name="send" size={15} color="#fff" />}
        </Pressable>
      </View>

      {turns.length === 0 ? (
        <View style={s.chips}>
          {SUGGESTIONS.map((q) => (
            <Pressable
              key={q}
              onPress={() => send(q)}
              style={({ pressed }) => [s.chip, pressed && { opacity: 0.6 }]}
              accessibilityRole="button"
            >
              <Text style={s.chipText}>{q}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {error ? <Text style={s.error}>{error}</Text> : null}
      <Text style={s.foot}>
        {enabled
          ? "Answers come from your store's data. Changes only happen when you confirm them."
          : "The assistant is not switched on for this shop yet."}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: palette.paper, borderRadius: radius.lg,
    borderWidth: 1, borderColor: palette.line,
    padding: 18, marginBottom: space.sm,
  },
  head: { flexDirection: "row", alignItems: "center", gap: space.xs },
  eyebrow: { ...type.section, color: palette.muted },
  title: { ...type.title, fontSize: 19, lineHeight: 24, color: palette.ink, marginTop: space.xs, marginBottom: space.md },
  thread: { maxHeight: 260, marginBottom: space.sm },
  turn: { borderRadius: radius.md, paddingHorizontal: 13, paddingVertical: 10, marginBottom: space.xs, maxWidth: "92%" },
  turnUser: { backgroundColor: palette.ink, alignSelf: "flex-end" },
  turnBot: { backgroundColor: palette.page, alignSelf: "flex-start" },
  turnText: { ...type.small, color: palette.ink },
  turnTextUser: { color: "#fff" },
  inputRow: { flexDirection: "row", gap: space.sm, alignItems: "flex-end" },
  input: {
    flex: 1, borderWidth: 1, borderColor: palette.line, borderRadius: radius.md,
    paddingHorizontal: 13, paddingVertical: 11, minHeight: 44, maxHeight: 110,
    fontFamily: type.body.fontFamily, fontSize: 14.5, color: palette.ink,
    backgroundColor: palette.page,
  },
  askButton: {
    width: 44, height: 44, borderRadius: radius.md, backgroundColor: palette.ink,
    alignItems: "center", justifyContent: "center",
  },
  askButtonOff: { backgroundColor: palette.muted },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.xs, marginTop: space.sm },
  chip: {
    borderWidth: 1, borderColor: palette.line, borderRadius: 100,
    paddingHorizontal: 13, paddingVertical: 8, backgroundColor: palette.page,
  },
  chipText: { ...type.small, fontSize: 12.5, color: palette.ink70 },
  error: { ...type.small, color: palette.bad, marginTop: space.sm },
  foot: { ...type.small, fontSize: 12, color: palette.muted, marginTop: space.sm, lineHeight: 17 },
});
