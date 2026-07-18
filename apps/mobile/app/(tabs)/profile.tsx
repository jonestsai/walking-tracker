import { useEffect, useState } from "react";
import { router } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { Row } from "../../src/Row";
import { Screen } from "../../src/Screen";
import { supabase } from "../../src/auth";
import { colors } from "../../src/theme";

export default function ProfileScreen() {
  const [accountLabel, setAccountLabel] = useState("Explorer");
  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => {
      if (data.user?.email) setAccountLabel(data.user.email);
      else if (data.user) setAccountLabel(`Explorer ${data.user.id.slice(0, 6)}`);
    });
  }, []);

  return (
    <Screen>
      <View style={styles.hero}><Text style={styles.eyebrow}>PROFILE</Text><Text style={styles.name}>{accountLabel}</Text></View>
      <Row title="Settings" onPress={() => router.push("/settings")} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { padding: 20, gap: 8, backgroundColor: colors.dark, borderRadius: 18 },
  eyebrow: { color: "#5eead4", fontSize: 11, fontWeight: "800", letterSpacing: 1 },
  name: { color: "white", fontSize: 24, fontWeight: "800" },
});
