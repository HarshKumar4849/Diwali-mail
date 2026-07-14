"use client";

import { Input } from "@/components/ui/input";

export function StepSendConfig({ data, updateData }: { data: any; updateData: (d: any) => void }) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1">Global BCC</label>
        <Input value={data.global_bcc || ""} onChange={e => updateData({ global_bcc: e.target.value })} placeholder="bcc1@example.com, bcc2@example.com" />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Global CC</label>
        <Input value={data.global_cc || ""} onChange={e => updateData({ global_cc: e.target.value })} placeholder="cc1@example.com, cc2@example.com" />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Rate Limit (emails per minute)</label>
        <Input type="number" value={data.rate_limit || 10} onChange={e => updateData({ rate_limit: parseInt(e.target.value) || 10 })} min={1} max={100} />
      </div>
    </div>
  );
}
