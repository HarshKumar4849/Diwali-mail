"use client";

import { useEffect, useState } from "react";
import type { WizardData } from "@/types";
import { renderTemplate, compileTemplate } from "@/lib/email/template";
import { Badge } from "@/components/ui/badge";
import {
  Mail,
  Users,
  Clock,
  Paperclip,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  Send,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { ScrollReveal } from "@/components/ui/scroll-reveal";

export function StepReview({
  data,
}: {
  data: WizardData;
  updateData: (d: Partial<WizardData>) => void;
}) {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [email, setEmail] = useState("");

  useEffect(() => {
    fetch("/api/auth/microsoft/status")
      .then((r) => r.json())
      .then((d) => {
        setConnected(d.connected);
        setEmail(d.email || "");
      })
      .catch(() => setConnected(false));
  }, []);

  const recipientCount = data.csvRows?.length || 0;
  const sampleRecipient = data.csvRows?.[0] || {};
  const sampleEmail = (data.emailColumn && sampleRecipient[data.emailColumn]) || "recipient@example.com";

  return (
    <div className="space-y-6">
      {/* Campaign Identity Header */}
      <div className="rounded-xl border border-border/70 bg-card p-5 md:p-6 shadow-xs space-y-4">
        <div>
          <span className="text-xs font-semibold text-primary uppercase tracking-wider">
            Ready for Launch
          </span>
          <h3 className="text-xl font-bold text-foreground mt-0.5">{data.name || "Untitled Campaign"}</h3>
          <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1.5 truncate">
            <Mail className="size-3.5 shrink-0" />
            <span className="italic font-medium text-foreground/90">
              {data.subject_template || "No subject configured"}
            </span>
          </p>
        </div>

        {/* 4-stat overview grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-border/50">
          <div className="p-3 rounded-lg bg-muted/30 border border-border/50 hover:border-border transition-colors duration-150">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Users className="size-3.5 text-primary" />
              <span>Recipients</span>
            </div>
            <p className="text-lg font-bold text-foreground mt-1 tabular-nums">{recipientCount}</p>
          </div>

          <div className="p-3 rounded-lg bg-muted/30 border border-border/50 hover:border-border transition-colors duration-150">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="size-3.5 text-primary" />
              <span>Speed</span>
            </div>
            <p className="text-lg font-bold text-foreground mt-1 tabular-nums">{data.rate_limit || 20}/min</p>
          </div>

          <div className="p-3 rounded-lg bg-muted/30 border border-border/50 hover:border-border transition-colors duration-150">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Paperclip className="size-3.5 text-primary" />
              <span>Attachments</span>
            </div>
            <p className="text-lg font-bold text-foreground mt-1 tabular-nums">
              {(data.globalAttachments?.length || 0) + (data.attachmentColumn ? 1 : 0)}
            </p>
          </div>

          <div className="p-3 rounded-lg bg-muted/30 border border-border/50 hover:border-border transition-colors duration-150">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <ShieldCheck className="size-3.5 text-primary" />
              <span>Copies</span>
            </div>
            <p className="text-lg font-bold text-foreground mt-1">
              {data.global_bcc || data.global_cc ? "Configured" : "None"}
            </p>
          </div>
        </div>
      </div>

      {/* Microsoft Outlook Connection Card */}
      <ScrollReveal variant="card">
        <div className="rounded-xl border border-border/70 bg-card p-4 md:p-5 shadow-xs flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
              <Send className="size-5" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-foreground">Microsoft Outlook Mailbox</h4>
              <p className="text-xs text-muted-foreground mt-0.5">
                Emails will be dispatched via Microsoft Graph from this account.
              </p>
            </div>
          </div>

          <div>
            {connected === null ? (
              <span className="text-xs text-muted-foreground">Verifying...</span>
            ) : connected ? (
              <Badge
                variant="outline"
                className="gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 text-xs font-medium"
              >
                <CheckCircle2 className="size-3" />
                <span>Connected as {email}</span>
              </Badge>
            ) : (
              <div className="flex items-center gap-2">
                <Badge
                  variant="outline"
                  className="gap-1 bg-amber-50 text-amber-700 border-amber-200 text-xs"
                >
                  <AlertCircle className="size-3" />
                  <span>Not Connected</span>
                </Badge>
                <Link
                  href="/settings"
                  className="text-xs text-primary font-semibold hover:underline"
                >
                  Connect in Settings
                </Link>
              </div>
            )}
          </div>
        </div>
      </ScrollReveal>

      {/* Email Sample Preview */}
      {data.csvRows?.[0] && (
        <ScrollReveal variant="section">
          <div className="rounded-xl border border-border/70 overflow-hidden bg-card shadow-xs">
            <div className="bg-muted/50 px-4 py-2.5 border-b border-border/60 flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5 font-semibold text-foreground">
                <Sparkles className="size-3.5 text-primary" />
                <span>Sample Dispatch (Recipient 1 of {recipientCount})</span>
              </div>
              <span className="text-muted-foreground font-mono">{sampleEmail}</span>
            </div>

            <div className="p-4 md:p-6 bg-background space-y-2 border-b border-border/40">
              <p className="text-xs text-muted-foreground">
                <strong className="text-foreground">To:</strong> {sampleEmail}
              </p>
              <p className="text-sm font-bold text-foreground break-words">
                <strong className="text-xs font-semibold text-muted-foreground">Subject: </strong>
                {renderTemplate(data.subject_template || "", sampleRecipient)}
              </p>
            </div>

            <div className="p-6 bg-card text-foreground text-sm leading-relaxed overflow-x-auto max-h-80 overflow-y-auto">
              <div
                className="prose dark:prose-invert max-w-none break-words"
                dangerouslySetInnerHTML={{
                  __html: compileTemplate(data.body_template || "", sampleRecipient),
                }}
              />
            </div>
          </div>
        </ScrollReveal>
      )}
    </div>
  );
}
