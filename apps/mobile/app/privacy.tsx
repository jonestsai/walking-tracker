import { StyleSheet, Text } from "react-native";
import { Screen } from "../src/Screen";
import { colors } from "../src/theme";

export default function PrivacyScreen() {
  return (
    <Screen>
      <Text style={styles.updated}>Last updated: July 20, 2026</Text>

      <Text style={styles.heading}>What we collect</Text>
      <Text style={styles.copy}>WalkingAtlas creates an anonymous account identifier for your installation. During an active Walk, it collects your precise location, location accuracy, and time of each location update to validate tile unlocks.</Text>

      <Text style={styles.heading}>How we use it</Text>
      <Text style={styles.copy}>Location is used only to validate and award tiles for your active Walk. Exact location updates are sent to WalkingAtlas while a Walk is active. The app keeps one recent exact location update only until the Walk ends. Your awarded tiles, walk dates, and city progress are retained so your progress can be shown.</Text>

      <Text style={styles.heading}>When collection happens</Text>
      <Text style={styles.copy}>WalkingAtlas collects location only after you start a Walk. If you allow background location, collection can continue while that active Walk is running and your phone is locked. Ending the Walk stops location updates.</Text>

      <Text style={styles.heading}>Your choices</Text>
      <Text style={styles.copy}>You can end a Walk at any time, change location access in iOS Settings, or use Delete my data in Settings to permanently delete your anonymous account, tiles, and walk history. Deleting data does not change your iOS location permission.</Text>

      <Text style={styles.heading}>Service providers</Text>
      <Text style={styles.copy}>WalkingAtlas uses its cloud service to validate tiles and store progress. Map tiles are provided by the map service configured for the app. We do not sell location data or use it for advertising or cross-app tracking.</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  updated: { color: colors.muted, fontSize: 13 },
  heading: { color: colors.text, fontSize: 18, fontWeight: "800", marginTop: 10 },
  copy: { color: colors.muted, fontSize: 15, lineHeight: 22 },
});
