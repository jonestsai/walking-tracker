import { StyleSheet, Text, View } from "react-native";
import { Screen } from "../src/Screen";
import { colors } from "../src/theme";

export default function AchievementsScreen() {
  return (
    <Screen>
      <Text style={styles.title}>Achievements</Text>
      <View style={styles.card}><Text style={styles.badge}>FIRST STEPS</Text><Text style={styles.cardTitle}>Your first verified tile</Text><Text style={styles.copy}>Start a Walk with a high-quality GPS signal to begin your collection.</Text></View>
      <View style={styles.card}><Text style={styles.badge}>NEXT UP</Text><Text style={styles.cardTitle}>City explorer</Text><Text style={styles.copy}>Achievement rules will arrive with the first city rollup.</Text></View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { color: colors.text, fontSize: 27, fontWeight: "800" },
  card: { padding: 20, borderRadius: 18, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, gap: 6 },
  badge: { color: colors.primary, fontSize: 11, fontWeight: "800", letterSpacing: 1 },
  cardTitle: { color: colors.text, fontSize: 18, fontWeight: "700" },
  copy: { color: colors.muted, lineHeight: 21 },
});
