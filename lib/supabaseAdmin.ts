import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const globalForSupabase = globalThis as unknown as {
  roomboardAdminClient?: SupabaseClient;
};

export function getSupabaseAdminClient() {
  if (globalForSupabase.roomboardAdminClient) {
    return globalForSupabase.roomboardAdminClient;
  }

  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    return null;
  }

  globalForSupabase.roomboardAdminClient = createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return globalForSupabase.roomboardAdminClient;
}

export type SupabaseVerifiedUser = {
  email?: string;
  id: string;
};

/**
 * Verify a Supabase access token sent as `Authorization: Bearer <jwt>` and
 * return the authenticated user. Returns null when Supabase admin is not
 * configured, the header is missing, or the token is invalid/expired.
 *
 * Billing routes use this so `userId`/`customerId` are never trusted from the
 * request body — they are derived from the verified session instead.
 */
export async function getSupabaseUserFromRequest(request: Request): Promise<SupabaseVerifiedUser | null> {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    return null;
  }

  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";

  if (!token) {
    return null;
  }

  try {
    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data.user) {
      return null;
    }

    return { email: data.user.email ?? undefined, id: data.user.id };
  } catch {
    return null;
  }
}
