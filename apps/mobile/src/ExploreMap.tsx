import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Linking, type NativeSyntheticEvent, Pressable, StyleSheet, Text, View } from "react-native";
import { Camera, type CameraRef, GeoJSONSource, Layer, Map, type ViewStateChangeEvent, UserLocation } from "@maplibre/maplibre-react-native";
import * as Location from "expo-location";
import { api } from "./api";
import { config } from "./config";
import { cellsToFeatureCollection } from "./h3GeoJson";
import { useWalk } from "./WalkProvider";

const formatElapsed = (milliseconds: number) => {
  const seconds = Math.floor(milliseconds / 1_000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  return hours > 0 ? `${hours}:${String(minutes % 60).padStart(2, "0")}` : `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
};

export function ExploreMap() {
  const { unlockedCells, replaceUnlockedCells, walking, busy, walkNewTiles, walkStartedAt, start, end } = useWalk();
  const [now, setNow] = useState(Date.now());
  const cameraRef = useRef<CameraRef>(null);
  const exploredTiles = useMemo(() => cellsToFeatureCollection(unlockedCells), [unlockedCells]);

  useEffect(() => {
    if (!walking) return;
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [walking]);

  const updateViewport = useCallback((event: NativeSyntheticEvent<ViewStateChangeEvent>) => {
    const { bounds, zoom } = event.nativeEvent;
    if (zoom < 12) {
      replaceUnlockedCells([]);
      return;
    }
    const [west, south, east, north] = bounds;
    void api.exploredCells({ west, south, east, north })
      .then(({ cells }) => replaceUnlockedCells(cells))
      .catch(console.warn);
  }, [replaceUnlockedCells]);

  const toggleWalk = async () => {
    try {
      if (walking) await end();
      else {
        await start();
        void Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
          .then((location) => cameraRef.current?.easeTo({ center: [location.coords.longitude, location.coords.latitude], zoom: 16, duration: 500 }))
          .catch((error) => console.warn("Unable to center the Walk map", error));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      if (message.includes("foreground") || message.includes("Background location")) {
        const locationMessage = message.includes("foreground")
          ? "Allow Precise Location in Walking Tracker’s Settings to start a Walk."
          : "Change Location to Always in Walking Tracker’s Settings to keep an active Walk unlocking tiles while your screen is locked.";
        Alert.alert("Location access", locationMessage, [
          { text: "Not now", style: "cancel" },
          { text: "Settings", onPress: () => void Linking.openSettings() },
        ]);
      } else {
        Alert.alert("Couldn’t start Walk", "The server could not create this Walk. Try again after the service is available.");
      }
      console.warn(error);
    }
  };

  return (
    <View style={styles.container}>
      <Map style={StyleSheet.absoluteFill} mapStyle={config.darkMapStyleUrl} logo={false} attribution onRegionDidChange={updateViewport}>
        <Camera ref={cameraRef} initialViewState={{ center: [-123.1207, 49.2827], zoom: 15 }} />
        {walking ? <UserLocation animated accuracy /> : null}
        <GeoJSONSource id="explored-tiles" data={exploredTiles}>
          <Layer id="explored-tile-fill" type="fill" paint={{ "fill-color": "#f8fafc", "fill-opacity": 0.38 }} />
          <Layer id="explored-tile-lines" type="line" paint={{ "line-color": "#ffffff", "line-opacity": 0.7, "line-width": 0.8 }} />
        </GeoJSONSource>
      </Map>

      <View style={styles.walkControl}>
        {walking ? <View style={styles.activeSession}><Text style={styles.sessionMetric}>{formatElapsed(now - (walkStartedAt ?? now))}</Text><Text style={styles.sessionDivider}>·</Text><Text style={styles.sessionMetric}>{walkNewTiles} tiles</Text></View> : null}
        <Pressable disabled={busy} onPress={() => void toggleWalk()} style={({ pressed }) => [styles.walkButton, (pressed || busy) && styles.walkButtonPressed]}>
          <Text style={styles.walkButtonText}>{busy ? "…" : walking ? "End Walk" : "Start Walk"}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  walkControl: { position: "absolute", left: 20, right: 20, bottom: 18, alignItems: "center", gap: 8 },
  activeSession: { flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: "rgba(15, 23, 42, 0.9)" },
  sessionMetric: { color: "white", fontSize: 14, fontWeight: "800" },
  sessionDivider: { color: "#5eead4", fontSize: 15 },
  walkButton: { minWidth: 164, alignItems: "center", paddingHorizontal: 24, paddingVertical: 15, borderRadius: 28, backgroundColor: "#0f766e", shadowColor: "#0f172a", shadowOpacity: 0.25, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 5 },
  walkButtonPressed: { opacity: 0.7 },
  walkButtonText: { color: "white", fontSize: 16, fontWeight: "800" },
});
