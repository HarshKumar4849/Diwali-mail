import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const supabase = await createClient();

  // Use admin client for auth-free upload
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name, base64 } = await req.json();
  if (!name || !base64) return NextResponse.json({ error: "No file provided" }, { status: 400 });

  const buffer = Buffer.from(base64, "base64");
  const ext = name.split(".").pop();
  const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("mailcraft").upload(path, buffer, {
    contentType: "application/octet-stream",
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: urlData } = supabase.storage.from("mailcraft").getPublicUrl(path);
  return NextResponse.json({ path, url: urlData.publicUrl, originalName: name });
}
