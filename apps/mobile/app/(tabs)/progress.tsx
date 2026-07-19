import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { api, type CityProgress, type RecentSession } from "../../src/api";
import { colors } from "../../src/theme";

type ProgressState = {
  totalTiles: number;
  tilesToday: number;
  streak: number;
  sessions: RecentSession[];
};

const formatSessionDate = (value: string) => new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
const formatSessionTime = (value: string) => new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(value));
const formatTileCount = (count: number) => `${new Intl.NumberFormat().format(count)} ${count === 1 ? "tile" : "tiles"}`;

export default function ProgressScreen() {
  const [progress, setProgress] = useState<ProgressState | null>(null);
  const [cities, setCities] = useState<CityProgress[] | null>(null);
  const [citiesUnavailable, setCitiesUnavailable] = useState(false);
  const [loading, setLoading] = useState(true);

  useFocusEffect(useCallback(() => {
    let active = true;
    setLoading(true);
    void Promise.allSettled([api.progress(), api.cities()]).then(([progressResult, citiesResult]) => {
      if (!active) return;
      if (progressResult.status === "fulfilled") {
        const { summary, sessions } = progressResult.value;
        setProgress({ totalTiles: summary.total_tiles, tilesToday: summary.tiles_today, streak: summary.current_streak, sessions });
      } else {
        console.warn(progressResult.reason);
      }
      if (citiesResult.status === "fulfilled") {
        setCities(citiesResult.value.cities);
        setCitiesUnavailable(false);
      } else {
        console.warn(citiesResult.reason);
        setCities(null);
        setCitiesUnavailable(true);
      }
      setLoading(false);
    });
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
        <Text style={styles.section}>Tiles by city</Text>
        {cities?.length ? cities.map((city) => (
          <View key={city.city_id} style={styles.city}>
            <View style={styles.cityCopy}><Text style={styles.cityName}>{city.city_name}</Text><Text style={styles.cityLocation}>{city.subdivision_code}, {city.country_code}</Text></View>
            <Text style={styles.cityTiles}>{formatTileCount(city.tile_count)}</Text>
          </View>
        )) : null}
        {cities?.length === 0 ? <View style={styles.cityEmpty}><Text style={styles.emptyTitle}>No city tiles yet</Text><Text style={styles.emptyCopy}>Tiles unlocked outside supported city boundaries still count toward your total.</Text></View> : null}
        {citiesUnavailable ? <View style={styles.cityEmpty}><Text style={styles.emptyTitle}>City progress is unavailable</Text><Text style={styles.emptyCopy}>Your overall tile progress is still available. Try again when you return to this tab.</Text></View> : null}
        <Text style={styles.section}>Recent</Text>
        {progress?.sessions.length ? progress.sessions.map((session) => <View key={session.id} style={styles.session}><View><Text style={styles.sessionTitle}>{session.tracking_mode === "background_walk" ? "Walk" : "Explore"}</Text><Text style={styles.sessionDate}>{formatSessionDate(session.started_at)}</Text><Text style={styles.sessionTime}>{formatSessionTime(session.started_at)} – {session.ended_at ? formatSessionTime(session.ended_at) : "In progress"}</Text></View><Text style={styles.sessionTiles}>{session.awarded_cell_count}</Text></View>) : <View style={styles.empty}><Text style={styles.emptyTitle}>No tiles yet</Text></View>}
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
  city: { minHeight: 78, padding: 16, borderRadius: 16, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, flexDirection: "row", alignItems: "center", gap: 12 },
  cityCopy: { flex: 1 },
  cityName: { color: colors.text, fontSize: 17, fontWeight: "700" },
  cityLocation: { color: colors.muted, fontSize: 13, marginTop: 3 },
  cityTiles: { color: colors.primary, fontSize: 17, fontWeight: "800", textAlign: "right" },
  session: { minHeight: 86, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, borderRadius: 14, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  sessionTitle: { color: colors.text, fontSize: 16, fontWeight: "700" },
  sessionDate: { color: colors.muted, fontSize: 13, marginTop: 2 },
  sessionTime: { color: colors.muted, fontSize: 13, marginTop: 2 },
  sessionTiles: { color: colors.primary, fontSize: 20, fontWeight: "800" },
  empty: { padding: 20, borderRadius: 16, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  cityEmpty: { padding: 20, borderRadius: 16, backgroundColor: colors.primarySoft, gap: 6 },
  emptyTitle: { color: colors.muted, fontSize: 16 },
  emptyCopy: { color: "#115e59", lineHeight: 20 },
});
