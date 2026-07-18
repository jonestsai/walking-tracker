import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { api, type RecentSession } from "../../src/api";
import { colors } from "../../src/theme";

type ProgressState = {
  totalTiles: number;
  tilesToday: number;
  streak: number;
  sessions: RecentSession[];
};

const formatSessionDate = (value: string) => new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(value));

export default function ProgressScreen() {
  const [progress, setProgress] = useState<ProgressState | null>(null);
  const [loading, setLoading] = useState(true);

  useFocusEffect(useCallback(() => {
    let active = true;
    setLoading(true);
    void api.progress()
      .then(({ summary, sessions }) => {
        if (!active) return;
        setProgress({ totalTiles: summary.total_tiles, tilesToday: summary.tiles_today, streak: summary.current_streak, sessions });
      })
      .catch(console.warn)
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []));

  if (loading && !progress) return <SafeAreaView style={styles.loading} edges={["bottom"]}><ActivityIndicator color={colors.primary} /></SafeAreaView>;

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Progress</Text>
        <View style={styles.statGrid}>
          <Stat value={progress?.totalTiles ?? 0} label="Tiles" />
          <Stat value={progress?.tilesToday ?? 0} label="Today" />
          <Stat value={progress?.streak ?? 0} label="Day streak" />
        </View>
        <Text style={styles.section}>Recent</Text>
        {progress?.sessions.length ? progress.sessions.map((session) => <View key={session.id} style={styles.session}><View><Text style={styles.sessionTitle}>{session.tracking_mode === "background_walk" ? "Walk" : "Explore"}</Text><Text style={styles.sessionDate}>{formatSessionDate(session.started_at)}</Text></View><Text style={styles.sessionTiles}>{session.awarded_cell_count}</Text></View>) : <View style={styles.empty}><Text style={styles.emptyTitle}>No tiles yet</Text></View>}
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return <View style={styles.stat}><Text style={styles.statValue}>{value}</Text><Text style={styles.statLabel}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  loading: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.background },
  content: { padding: 20, gap: 16 },
  title: { color: colors.text, fontSize: 30, fontWeight: "800" },
  statGrid: { flexDirection: "row", gap: 10 },
  stat: { flex: 1, minHeight: 112, justifyContent: "center", padding: 14, borderRadius: 18, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  statValue: { color: colors.text, fontSize: 28, fontWeight: "800" },
  statLabel: { color: colors.muted, fontSize: 13, marginTop: 3 },
  section: { color: colors.muted, fontSize: 12, fontWeight: "800", letterSpacing: 0.8, textTransform: "uppercase", marginTop: 6 },
  session: { minHeight: 68, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, borderRadius: 14, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  sessionTitle: { color: colors.text, fontSize: 16, fontWeight: "700" },
  sessionDate: { color: colors.muted, fontSize: 13, marginTop: 2 },
  sessionTiles: { color: colors.primary, fontSize: 20, fontWeight: "800" },
  empty: { padding: 20, borderRadius: 16, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  emptyTitle: { color: colors.muted, fontSize: 16 },
});
