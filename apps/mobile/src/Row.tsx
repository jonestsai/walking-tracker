import { type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "./theme";

export function Row({ title, detail, onPress, right }: { title: string; detail?: string; onPress?: () => void; right?: ReactNode }) {
  return (
    <Pressable accessibilityRole={onPress ? "button" : undefined} onPress={onPress} disabled={!onPress} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <View style={styles.copy}>
        <Text style={styles.title}>{title}</Text>
        {detail ? <Text style={styles.detail}>{detail}</Text> : null}
      </View>
      {right ?? (onPress ? <Text style={styles.chevron}>›</Text> : null)}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: 64, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 14 },
  pressed: { opacity: 0.65 },
  copy: { flex: 1, gap: 3 },
  title: { color: colors.text, fontSize: 16, fontWeight: "600" },
  detail: { color: colors.muted, fontSize: 13 },
  chevron: { color: colors.muted, fontSize: 28, lineHeight: 28 },
});
