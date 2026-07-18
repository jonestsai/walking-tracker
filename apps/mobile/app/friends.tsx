import { StyleSheet, Text, View } from "react-native";
import { Screen } from "../src/Screen";
import { colors } from "../src/theme";

export default function FriendsScreen() {
  return (
    <Screen>
      <Text style={styles.title}>Friends</Text>
      <View style={styles.card}><Text style={styles.cardTitle}>Social exploration is coming next.</Text><Text style={styles.copy}>Friends will share aggregate tile progress and streaks only. Exact live location will remain private by default.</Text></View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { color: colors.text, fontSize: 27, fontWeight: "800" },
  card: { padding: 20, borderRadius: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, gap: 8 },
  cardTitle: { color: colors.text, fontSize: 18, fontWeight: "700" },
  copy: { color: colors.muted, lineHeight: 21 },
});
