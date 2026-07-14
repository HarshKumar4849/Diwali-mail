"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function Settings() {
  const [connected, setConnected] = useState(false);
  const [email, setEmail] = useState("");
  const supabase = createClient();

  useEffect(() => {
    fetch("/api/auth/microsoft/status")
      .then(r => r.json())
      .then(data => {
        setConnected(data.connected);
        setEmail(data.email || "");
      });
  }, []);

  const handleConnect = () => {
    window.location.href = "/api/auth/microsoft";
  };

  const handleDisconnect = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("microsoft_tokens").delete().eq("user_id", user.id);
    setConnected(false);
  };

  return (
    <div className="container mx-auto p-6 max-w-2xl">
      <h1 className="text-3xl font-bold mb-6">Settings</h1>
      <Card>
        <CardHeader>
          <CardTitle>Microsoft Outlook</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            {connected ? `Connected as ${email}` : "Not connected"}
          </p>
          {connected ? (
            <Button variant="destructive" onClick={handleDisconnect}>Disconnect</Button>
          ) : (
            <Button onClick={handleConnect}>Connect Outlook</Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
