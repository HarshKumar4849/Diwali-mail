"use client";

import { Input } from "@/components/ui/input";
import type { WizardData } from "@/types";
import { EmailInput } from "@/components/email-input";

export function StepSendConfig({ data, updateData }: { data: WizardData; updateData: (d: Partial<WizardData>) => void }) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1">Global BCC</label>
        <EmailInput value={data.global_bcc || ""} onChange={val => updateData({ global_bcc: val })} placeholder="bcc1@example.com" />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Global CC</label>
        <EmailInput value={data.global_cc || ""} onChange={val => updateData({ global_cc: val })} placeholder="cc1@example.com" />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Rate Limit (emails per minute)</label>
        <Input type="number" value={data.rate_limit || 20} onChange={e => updateData({ rate_limit: parseInt(e.target.value) || 20 })} min={1} max={100} />
      </div>
    </div>
  );
}
