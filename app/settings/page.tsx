"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function Settings() {
  const [connected, setConnected] = useState(false);
  const [userEmail, setUserEmail] = useState("");
  const supabase = createClient();

  useEffect(() => {
    supabase.from("microsoft_tokens").select("*").limit(1).then(({ data }) => {
      setConnected(!!(data && data.length > 0));
    });
    supabase.auth.getUser().then(({ data }) => {
      setUserEmail(data.user?.email || "");
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
            {connected ? `Connected as ${userEmail}` : "Not connected"}
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
