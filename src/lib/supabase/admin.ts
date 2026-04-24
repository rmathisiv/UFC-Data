import { createClient } from "@supabase/supabase-js";
import {
  supabaseServiceRoleKey,
  supabaseUrl,
} from "./env";

/**
 * Server-only client with service-role privileges. Use from scripts, cron
 * jobs, and route handlers that need to bypass RLS. Never import from a
 * client component.
 */
export function createAdminClient() {
  return createClient(supabaseUrl(), supabaseServiceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
