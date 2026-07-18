import { NativeModules, Platform } from "react-native";

type LocationAccuracyModule = {
  isPreciseLocationEnabled(): Promise<boolean>;
};

const locationAccuracyModule = NativeModules.LocationAccuracyModule as LocationAccuracyModule | undefined;

export async function hasPreciseLocationAccess(): Promise<boolean> {
  if (Platform.OS !== "ios") return true;
  if (!locationAccuracyModule) return false;

  try {
    return await locationAccuracyModule.isPreciseLocationEnabled();
  } catch {
    return false;
  }
}
