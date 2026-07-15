import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name } = await req.json();
  if (!name) return NextResponse.json({ error: "No file name provided" }, { status: 400 });

  const ext = name.split(".").pop();
  const path = `${user.id}/${crypto.randomUUID()}.${ext}`;

  const { data, error } = await supabase.storage.from("mailcraft").createSignedUploadUrl(path);
  if (error || !data) return NextResponse.json({ error: error?.message || "Failed to create upload URL" }, { status: 500 });

  return NextResponse.json({ path, uploadUrl: data.signedUrl, originalName: name });
}
