import { createClient } from "@supabase/supabase-js";

export function createAdminClient() {
  const key = process.env.SUPABASE_SECRET_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    key,
    { db: { schema: "public" } }
  );
}

export async function getAdminClient() {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (key) {
    return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, { db: { schema: "public" } });
  }

  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { db: { schema: "public" } }
  );

  if (process.env.SEED_EMAIL && process.env.SEED_PASSWORD) {
    await client.auth.signInWithPassword({
      email: process.env.SEED_EMAIL,
      password: process.env.SEED_PASSWORD,
    });
  }

  return client;
}
