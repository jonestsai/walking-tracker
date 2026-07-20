const required = (value: string | undefined, name: string): string => {
  if (!value) throw new Error(`Missing ${name}`);
  return value;
};

export const config = {
  apiUrl: required(process.env.EXPO_PUBLIC_API_URL, "EXPO_PUBLIC_API_URL").replace(/\/$/, ""),
  supabaseUrl: required(process.env.EXPO_PUBLIC_SUPABASE_URL, "EXPO_PUBLIC_SUPABASE_URL"),
  supabasePublishableKey: required(
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    "EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  ),
  mapStyleUrl: required(process.env.EXPO_PUBLIC_MAP_STYLE_URL, "EXPO_PUBLIC_MAP_STYLE_URL"),
};
