import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  const envPath = resolve(__dirname, "..", ".env.local");
  try {
    const content = readFileSync(envPath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'")))
        val = val.slice(1, -1);
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {}
}

loadEnv();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SECRET_KEY;
const email = process.env.SEED_EMAIL;
const password = process.env.SEED_PASSWORD;

if (!email || !password) {
  console.log("SEED_EMAIL and SEED_PASSWORD not set — skipping user seed");
  process.exit(0);
}

if (!supabaseUrl || !supabaseUrl.match(/^https?:\/\//i) || !serviceRoleKey) {
  console.error("Supabase env vars not set or invalid — skipping user seed");
  process.exit(0);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

const { data, error } = await supabase.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
});

if (error?.message?.includes("already exists") || error?.message?.includes("already been registered") || error?.message?.includes("User already registered")) {
  const { data: list, error: listError } = await supabase.auth.admin.listUsers();
  if (listError) {
    console.error("Failed to list users:", listError.message);
    process.exit(1);
  }
  const user = list.users.find((u) => u.email === email);
  if (user) {
    const { error: updateError } = await supabase.auth.admin.updateUserById(user.id, { password });
    if (updateError) {
      console.error("Failed to update user password:", updateError.message);
      process.exit(1);
    }
    console.log(`Updated password for ${email}`);
  }
} else if (error) {
  console.error("Failed to create user:", error.message);
  process.exit(1);
} else {
  console.log(`Created user ${email}`);
}
