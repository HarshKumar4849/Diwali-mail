import { createClient } from "@/lib/supabase/server";
import type { User } from "@supabase/supabase-js";

export async function getAuthenticatedUser(): Promise<{ user: User | null }> {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { user: null };
  return { user: session.user };
}
