import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import * as Location from "expo-location";
import { Linking, StyleSheet, Text } from "react-native";
import { Row } from "../src/Row";
import { Screen } from "../src/Screen";
import { colors } from "../src/theme";

export default function SettingsScreen() {
  const [locationAccess, setLocationAccess] = useState("Checking…");
  const refreshPermission = useCallback(() => {
    void Promise.all([Location.getForegroundPermissionsAsync(), Location.getBackgroundPermissionsAsync()])
      .then(([foreground, background]) => setLocationAccess(background.granted ? "Always" : foreground.granted ? "While Using" : "Off"))
      .catch(() => setLocationAccess("Off"));
  }, []);
  useFocusEffect(useCallback(() => {
    refreshPermission();
  }, [refreshPermission]));

  return (
    <Screen>
      <Text style={styles.section}>Location</Text>
      <Row title="Location access" detail={locationAccess} onPress={() => void Linking.openSettings()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { color: colors.muted, fontSize: 12, fontWeight: "800", letterSpacing: 0.7, textTransform: "uppercase" },
});
