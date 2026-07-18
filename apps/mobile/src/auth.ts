import "react-native-url-polyfill/auto";
import "react-native-get-random-values";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import { config } from "./config";

export const supabase = createClient(config.supabaseUrl, config.supabasePublishableKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

export async function getAccessToken(): Promise<string> {
  let { data } = await supabase.auth.getSession();
  if (!data.session) {
    const result = await supabase.auth.signInAnonymously();
    if (result.error || !result.data.session) throw result.error ?? new Error("Anonymous sign-in failed");
    data = { session: result.data.session };
  }
  return data.session.access_token;
}
