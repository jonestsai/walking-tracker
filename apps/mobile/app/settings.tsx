import { useCallback, useState } from "react";
import { router, useFocusEffect } from "expo-router";
import * as Location from "expo-location";
import { Alert, Linking, StyleSheet, Text } from "react-native";
import { api } from "../src/api";
import { supabase } from "../src/auth";
import { clearAllLocalWalkData } from "../src/locationQueue";
import { LOCATION_TASK } from "../src/locationTask";
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

  const deleteAccount = () => {
    Alert.alert(
      "Delete all WalkingAtlas data?",
      "This permanently deletes your account, unlocked tiles, and walk history. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete data",
          style: "destructive",
          onPress: () => {
            void (async () => {
              try {
                await api.deleteAccount();
                await Location.stopLocationUpdatesAsync(LOCATION_TASK).catch(() => undefined);
                clearAllLocalWalkData();
                await supabase.auth.signOut();
                setLocationAccess("Off");
                Alert.alert("Data deleted", "Your WalkingAtlas account and associated data have been deleted from our service.");
              } catch {
                Alert.alert("Couldn’t delete data", "Please try again later. Your data has not been deleted.");
              }
            })();
          },
        },
      ],
    );
  };

  return (
    <Screen>
      <Text style={styles.section}>Location</Text>
      <Row title="Location access" detail={locationAccess} onPress={() => void Linking.openSettings()} />
      <Text style={styles.section}>Privacy</Text>
      <Row title="Privacy policy" detail="How WalkingAtlas handles location and progress data" onPress={() => router.push("/privacy")} />
      <Row title="Delete my data" detail="Permanently delete your account, tiles, and walk history" onPress={deleteAccount} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { color: colors.muted, fontSize: 12, fontWeight: "800", letterSpacing: 0.7, textTransform: "uppercase" },
});
