const required = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
};

export const config = {
  apiUrl: required("EXPO_PUBLIC_API_URL").replace(/\/$/, ""),
  supabaseUrl: required("EXPO_PUBLIC_SUPABASE_URL"),
  supabasePublishableKey: required("EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
  mapStyleUrl: required("EXPO_PUBLIC_MAP_STYLE_URL"),
  // The supplied starter style is MapTiler Streets v2. Its dark counterpart
  // preserves the same key and all query parameters.
  darkMapStyleUrl: required("EXPO_PUBLIC_MAP_STYLE_URL").replace("/maps/streets-v2/", "/maps/streets-v2-dark/"),
};
