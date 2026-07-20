import { Stack } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { WalkProvider } from "../src/WalkProvider";
import { colors } from "../src/theme";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <WalkProvider>
        <Stack screenOptions={{ headerStyle: { backgroundColor: colors.card }, headerTintColor: colors.text, contentStyle: { backgroundColor: colors.background } }}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="leaderboards" options={{ title: "Leaderboards" }} />
          <Stack.Screen name="cities" options={{ title: "Cities" }} />
          <Stack.Screen name="friends" options={{ title: "Friends" }} />
          <Stack.Screen name="achievements" options={{ title: "Achievements" }} />
          <Stack.Screen name="settings" options={{ title: "Settings", headerBackButtonDisplayMode: "minimal" }} />
          <Stack.Screen name="privacy" options={{ title: "Privacy", headerBackButtonDisplayMode: "minimal" }} />
        </Stack>
      </WalkProvider>
    </SafeAreaProvider>
  );
}
