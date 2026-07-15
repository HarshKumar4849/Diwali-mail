import { createClient } from "@/lib/supabase/server";
import type { User } from "@supabase/supabase-js";

export async function getAuthenticatedUser(): Promise<{ user: User | null }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return { user };
}
