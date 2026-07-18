import { StyleSheet, Text, View } from "react-native";
import { Screen } from "../src/Screen";
import { colors } from "../src/theme";

const tiers = ["Your city", "Your province / state", "Your country"];

export default function LeaderboardsScreen() {
  return (
    <Screen>
      <Text style={styles.title}>Make every walk count.</Text>
      <Text style={styles.copy}>Leaderboards will rank explorers by verified unlocked tiles, with separate rankings for each travel mode.</Text>
      {tiers.map((tier) => <View key={tier} style={styles.card}><Text style={styles.cardTitle}>{tier}</Text><Text style={styles.cardCopy}>Available once your first location is verified.</Text></View>)}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { color: colors.text, fontSize: 27, fontWeight: "800" },
  copy: { color: colors.muted, lineHeight: 21, marginBottom: 6 },
  card: { padding: 18, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, gap: 4 },
  cardTitle: { color: colors.text, fontSize: 17, fontWeight: "700" },
  cardCopy: { color: colors.muted },
});
