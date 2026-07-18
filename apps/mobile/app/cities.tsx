import { StyleSheet, Text, View } from "react-native";
import { Screen } from "../src/Screen";
import { colors } from "../src/theme";

export default function CitiesScreen() {
  return (
    <Screen>
      <Text style={styles.title}>Your cities</Text>
      <View style={styles.empty}><Text style={styles.emptyTitle}>Your map will tell the story.</Text><Text style={styles.emptyCopy}>When you unlock your first tile in a city, it will appear here with its local leaderboard.</Text></View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { color: colors.text, fontSize: 27, fontWeight: "800" },
  empty: { padding: 22, borderRadius: 18, backgroundColor: colors.primarySoft, gap: 7 },
  emptyTitle: { color: colors.text, fontSize: 18, fontWeight: "700" },
  emptyCopy: { color: "#115e59", lineHeight: 21 },
});
