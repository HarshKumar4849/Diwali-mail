"use client";

import { Input } from "@/components/ui/input";
import { ScrollReveal } from "@/components/ui/scroll-reveal";
import type { WizardData } from "@/types";
import { EmailInput } from "@/components/email-input";
import { Gauge, ShieldCheck } from "lucide-react";

export function StepSendConfig({
  data,
  updateData,
}: {
  data: WizardData;
  updateData: (d: Partial<WizardData>) => void;
}) {
  return (
    <div className="space-y-6">
      {/* Visibility & Compliance (CC / BCC) Card */}
      <div className="rounded-xl border border-border/70 bg-card p-5 md:p-6 shadow-xs space-y-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-primary" />
            <h3 className="font-semibold text-base text-foreground">Visibility & Copies</h3>
          </div>
          <p className="text-xs text-muted-foreground">
            Automatically copy team members or CRM compliance addresses on every outbound message.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 pt-2">
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-foreground">
              Global BCC (Blind Copy)
            </label>
            <EmailInput
              value={data.global_bcc || ""}
              onChange={(val) => updateData({ global_bcc: val })}
              placeholder="e.g. crm@company.com, audit@company.com"
            />
            <p className="text-[11px] text-muted-foreground">
              Hidden from recipients. Type email and press Enter or comma.
            </p>
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-semibold text-foreground">
              Global CC (Carbon Copy)
            </label>
            <EmailInput
              value={data.global_cc || ""}
              onChange={(val) => updateData({ global_cc: val })}
              placeholder="e.g. manager@company.com"
            />
            <p className="text-[11px] text-muted-foreground">
              Visible to all recipients. Type email and press Enter or comma.
            </p>
          </div>
        </div>
      </div>

      {/* Sending Speed & Rate Limiting Card */}
      <ScrollReveal variant="section">
        <div className="rounded-xl border border-border/70 bg-card p-5 md:p-6 shadow-xs space-y-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Gauge className="size-4 text-primary" />
              <h3 className="font-semibold text-base text-foreground">Sending Speed</h3>
            </div>
            <p className="text-xs text-muted-foreground">
              Control the maximum dispatch frequency for this specific campaign.
            </p>
          </div>

          <div className="max-w-xs space-y-2 pt-2">
            <label className="block text-xs font-semibold text-foreground">
              Rate Limit (Emails per minute)
            </label>
            <div className="flex items-center gap-3">
              <Input
                type="number"
                value={data.rate_limit || 20}
                onChange={(e) => updateData({ rate_limit: parseInt(e.target.value) || 20 })}
                min={1}
                max={100}
                className="h-10 text-sm font-mono w-32 bg-background"
              />
              <span className="text-xs text-muted-foreground font-medium">emails / minute</span>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              This campaign manages its own dedicated sending rate independently of other active campaigns.
            </p>
          </div>
        </div>
      </ScrollReveal>
    </div>
  );
}
