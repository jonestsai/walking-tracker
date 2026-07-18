import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { Screen } from "../src/Screen";
import { api, type CityProgress } from "../src/api";
import { colors } from "../src/theme";

export default function CitiesScreen() {
  const [cities, setCities] = useState<CityProgress[] | null>(null);

  useFocusEffect(useCallback(() => {
    let active = true;
    void api.cities().then(({ cities: nextCities }) => {
      if (active) setCities(nextCities);
    }).catch(console.warn);
    return () => { active = false; };
  }, []));

  return (
    <Screen>
      <Text style={styles.title}>Your cities</Text>
      {cities === null ? <View style={styles.loading}><ActivityIndicator color={colors.primary} /></View> : null}
      {cities?.length ? cities.map((city) => (
        <View key={city.city_id} style={styles.city}>
          <View><Text style={styles.cityName}>{city.city_name}</Text><Text style={styles.location}>{city.subdivision_code}, {city.country_code}</Text></View>
          <Text style={styles.tiles}>{city.tile_count}</Text>
        </View>
      )) : null}
      {cities?.length === 0 ? <View style={styles.empty}><Text style={styles.emptyTitle}>Your map will tell the story.</Text><Text style={styles.emptyCopy}>Unlock tiles in a supported city to see it here. Tiles elsewhere still count toward your total.</Text></View> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { color: colors.text, fontSize: 27, fontWeight: "800" },
  loading: { alignItems: "center", padding: 28 },
  city: { minHeight: 78, padding: 16, borderRadius: 16, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  cityName: { color: colors.text, fontSize: 17, fontWeight: "700" },
  location: { color: colors.muted, marginTop: 3 },
  tiles: { color: colors.primary, fontSize: 22, fontWeight: "800" },
  empty: { padding: 22, borderRadius: 18, backgroundColor: colors.primarySoft, gap: 7 },
  emptyTitle: { color: colors.text, fontSize: 18, fontWeight: "700" },
  emptyCopy: { color: "#115e59", lineHeight: 21 },
});
