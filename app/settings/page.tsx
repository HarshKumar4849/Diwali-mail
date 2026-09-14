"use client";

import { useEffect, useState, Suspense } from "react";

export const dynamic = "force-dynamic";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollReveal } from "@/components/ui/scroll-reveal";
import { useSearchParams } from "next/navigation";
import {
  Send,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  Power,
  KeyRound,
  User,
  LogOut,
} from "lucide-react";

function SettingsInner() {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [email, setEmail] = useState("");
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const error = searchParams.get("error");

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUserEmail(user?.email || null);
    });

    fetch("/api/auth/microsoft/status")
      .then((r) => {
        if (!r.ok) throw new Error("Status check failed");
        return r.json();
      })
      .then((data) => {
        setConnected(Boolean(data.connected));
        setEmail(data.email || "");
      })
      .catch(() => {
        setConnected(false);
        setEmail("");
      });
  }, []);

  const handleConnect = () => {
    window.location.href = "/api/auth/microsoft";
  };

  const handleDisconnect = async () => {
    if (!confirm("Disconnect your Outlook account? Campaigns will pause until reconnected.")) return;
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("microsoft_tokens").delete().eq("user_id", user.id);
    setConnected(false);
    setEmail("");
  };

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/login";
  };

  return (
    <div className="container mx-auto p-4 md:p-8 pb-24 md:pb-12 max-w-4xl space-y-8">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
          Settings & Integrations
        </h1>
        <p className="text-xs sm:text-sm text-muted-foreground mt-1">
          Manage your connected mailboxes, OAuth tokens, and sending credentials.
        </p>
      </div>

      {error && (
        <div className="p-4 rounded-xl border border-destructive/20 bg-destructive/5 text-destructive text-sm flex items-center gap-2">
          <AlertCircle className="size-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Connected Accounts Section */}
      <ScrollReveal variant="card">
        <div className="rounded-2xl border border-border/70 bg-card p-6 md:p-8 shadow-xs space-y-6">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2.5">
                <div className="size-9 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                  <Send className="size-5" />
                </div>
                <h2 className="text-lg font-bold text-foreground">Microsoft 365 / Outlook Mailbox</h2>
              </div>
              <p className="text-xs text-muted-foreground max-w-xl">
                Mailcraft sends personalized emails directly through your official Microsoft 365 account using Microsoft Graph API, maintaining high deliverability.
              </p>
            </div>

            <div>
              {connected === null ? (
                <span className="text-xs text-muted-foreground">Checking status...</span>
              ) : connected ? (
                <Badge
                  variant="outline"
                  className="gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 text-xs font-semibold"
                >
                  <CheckCircle2 className="size-3.5" />
                  <span>Connected</span>
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="gap-1.5 px-3 py-1 bg-muted text-muted-foreground border-border text-xs"
                >
                  <span>Not Connected</span>
                </Badge>
              )}
            </div>
          </div>

          {connected ? (
            <div className="p-4 rounded-xl bg-muted/30 border border-border/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Authenticated Sender Address</p>
                <p className="text-sm font-bold text-foreground mt-0.5">{email || "Connected Outlook Account"}</p>
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mt-1">
                  <ShieldCheck className="size-3 text-emerald-600" />
                  <span>OAuth 2.0 active with automatic token refresh</span>
                </div>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={handleDisconnect}
                className="text-destructive/80 hover:text-destructive hover:bg-destructive/10 gap-1.5 text-xs h-9 shrink-0"
              >
                <Power className="size-3.5" />
                <span>Disconnect</span>
              </Button>
            </div>
          ) : (
            <div className="p-6 rounded-xl border border-dashed border-border/80 bg-muted/15 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-foreground">Connect your Outlook or Microsoft 365 Account</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Authorizes Mailcraft to send emails and manage campaign deliveries on your behalf.
                </p>
              </div>
              <Button onClick={handleConnect} className="gap-2 shrink-0 shadow-xs">
                <KeyRound className="size-4" />
                <span>Connect Outlook</span>
              </Button>
            </div>
          )}
        </div>
      </ScrollReveal>

      {/* Mailcraft Account Section */}
      <ScrollReveal variant="card">
        <div className="rounded-2xl border border-border/70 bg-card p-6 md:p-8 shadow-xs space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2.5">
                <div className="size-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                  <User className="size-5" />
                </div>
                <h2 className="text-lg font-bold text-foreground">Mailcraft User Account</h2>
              </div>
              <p className="text-xs text-muted-foreground max-w-xl">
                Current authenticated application session.
              </p>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-muted/30 border border-border/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <p className="text-xs text-muted-foreground">Logged-In User</p>
              <p className="text-sm font-bold text-foreground mt-0.5">{userEmail || "Signed in"}</p>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={handleSignOut}
              className="text-destructive/80 hover:text-destructive hover:bg-destructive/10 gap-1.5 text-xs h-9 shrink-0"
            >
              <LogOut className="size-3.5" />
              <span>Log Out of Mailcraft</span>
            </Button>
          </div>
        </div>
      </ScrollReveal>
    </div>
  );
}

export default function Settings() {
  return (
    <Suspense fallback={<div className="container mx-auto p-8 text-center text-muted-foreground">Loading settings...</div>}>
      <SettingsInner />
    </Suspense>
  );
}
