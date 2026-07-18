import { Tabs } from "expo-router";
import { colors } from "../../src/theme";

export default function TabLayout() {
  return (
    <Tabs screenOptions={{ headerStyle: { backgroundColor: colors.card }, headerTintColor: colors.text, tabBarActiveTintColor: colors.primary, tabBarInactiveTintColor: colors.muted }}>
      <Tabs.Screen name="index" options={{ title: "Explore" }} />
      <Tabs.Screen name="progress" options={{ title: "Progress" }} />
      <Tabs.Screen name="profile" options={{ title: "Profile" }} />
    </Tabs>
  );
}
