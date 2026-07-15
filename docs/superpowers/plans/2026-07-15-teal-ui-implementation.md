# Mailcraft Teal UI Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Revamp Mailcraft's UI with a teal accent aesthetic and mobile-friendly responsive design.

**Architecture:** CSS custom properties in `globals.css` define the color palette (teal primary on light backgrounds). shadcn/ui components reference these variables — no component rewrites needed. Add a mobile bottom tab bar, restructure page layouts for responsive breakpoints, and add micro-interactions via CSS animations.

**Tech Stack:** Next.js 16, React 19, Tailwind CSS v4, shadcn/ui (base-nova), Lucide icons, sonner toasts

**Spec:** `docs/superpowers/specs/2026-07-15-teal-ui-redesign.md`

---

## File Structure

### New files
- `components/bottom-nav.tsx` — Mobile bottom tab bar with 3 tabs (Dashboard, New Campaign, Settings)
- `components/ui/loading-skeleton.tsx` — Teal-tinted shimmer skeleton component

### Modified files
- `app/globals.css` — Replace CSS variables with teal palette
- `components/navbar.tsx` — Teal background, sticky, responsive (simplifies on mobile)
- `app/layout.tsx` — Add BottomNav component, responsive wrapper
- `app/page.tsx` — Dashboard: stat cards, FAB on mobile, teal campaign cards
- `components/campaign-card.tsx` — Teal accent top border, status badge colors
- `components/progress-bar.tsx` — Teal fill
- `app/campaign/[id]/page.tsx` — Two-column desktop, stacked mobile layout
- `app/campaign/new/page.tsx` — Mobile layout tweaks
- `components/campaign-wizard/wizard.tsx` — Compact step indicator, bottom-fixed nav buttons
- `components/ui/card.tsx` — Add teal accent border variant
- `components/ui/badge.tsx` — Add status color variants
- `components/ui/button.tsx` — Minor hover state refinements
- `components/ui/dialog.tsx` — Teal accent styling
- `components/ui/progress.tsx` — Teal track (already handled by CSS var, verify)
- `app/settings/page.tsx` — Responsive layout

---

### Task 1: Theme Color Variables

**Files:**
- Modify: `app/globals.css:51-84`

- [ ] **Step 1: Replace `:root` CSS variables with teal palette**

Replace the `:root` block in `app/globals.css`:

```css
:root {
  --background: oklch(1 0 0);
  --foreground: oklch(0.145 0 0);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.145 0 0);
  --popover: oklch(1 0 0);
  --popover-foreground: oklch(0.145 0 0);
  --primary: oklch(0.55 0.12 190);
  --primary-foreground: oklch(1 0 0);
  --secondary: oklch(0.97 0 0);
  --secondary-foreground: oklch(0.205 0 0);
  --muted: oklch(0.95 0.005 190);
  --muted-foreground: oklch(0.6 0.01 190);
  --accent: oklch(0.92 0.02 190);
  --accent-foreground: oklch(0.35 0.06 190);
  --destructive: oklch(0.577 0.245 27.325);
  --border: oklch(0.85 0.01 190);
  --input: oklch(0.85 0.01 190);
  --ring: oklch(0.65 0.15 190);
  --chart-1: oklch(0.6 0.12 190);
  --chart-2: oklch(0.5 0.1 190);
  --chart-3: oklch(0.4 0.08 190);
  --chart-4: oklch(0.7 0.1 190);
  --chart-5: oklch(0.45 0.09 190);
  --radius: 0.625rem;
  --sidebar: oklch(0.985 0 0);
  --sidebar-foreground: oklch(0.145 0 0);
  --sidebar-primary: oklch(0.55 0.12 190);
  --sidebar-primary-foreground: oklch(1 0 0);
  --sidebar-accent: oklch(0.92 0.02 190);
  --sidebar-accent-foreground: oklch(0.35 0.06 190);
  --sidebar-border: oklch(0.85 0.01 190);
  --sidebar-ring: oklch(0.65 0.15 190);
}
```

- [ ] **Step 2: Verify the build**

Run: `npm run build` or `npm run dev` and check the app loads with teal accents on buttons, badges, focus rings.

Expected: Primary buttons are teal, focus rings show teal glow, borders are cool toned.

- [ ] **Step 3: Commit**

```bash
git add app/globals.css
git commit -m "feat: add teal accent color palette to theme"
```

---

### Task 2: Desktop Navbar — Teal + Responsive

**Files:**
- Modify: `components/navbar.tsx`

- [ ] **Step 1: Rewrite the Navbar component**

Replace with teal background, nav links, and responsive behavior:

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const navLinks = [
  { href: "/", label: "Dashboard" },
  { href: "/campaign/new", label: "New Campaign" },
  { href: "/settings", label: "Settings" },
];

export function Navbar() {
  const pathname = usePathname();

  return (
    <nav className="bg-primary text-primary-foreground sticky top-0 z-40 hidden md:block">
      <div className="container mx-auto flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-6">
          <Link href="/" className="text-lg font-bold tracking-tight">
            Mailcraft
          </Link>
          <div className="flex gap-1">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "px-3 py-1.5 rounded-md text-sm transition-colors",
                  pathname === link.href
                    ? "bg-white/20 font-medium"
                    : "hover:bg-white/10"
                )}
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
        <Link
          href="/settings"
          className="text-sm hover:underline underline-offset-4"
        >
          Account
        </Link>
      </div>
    </nav>
  );
}
```

- [ ] **Step 2: Verify**

Check that the navbar is:
- Hidden on mobile (uses `hidden md:block`)
- Teal background with white text
- Active link has a white/20 background
- Sticky at top

- [ ] **Step 3: Commit**

```bash
git add components/navbar.tsx
git commit -m "feat: teal desktop navbar with nav links and responsive hiding"
```

---

### Task 3: Mobile Bottom Tab Bar

**Files:**
- Create: `components/bottom-nav.tsx`
- Modify: `app/layout.tsx`

- [ ] **Step 1: Create BottomNav component**

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { LayoutDashboard, Plus, Settings } from "lucide-react";

const tabs = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/campaign/new", label: "New", icon: Plus },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function BottomNav() {
  const pathname = usePathname();

  // Hide bottom nav on login and campaign detail sub-views
  if (pathname === "/login" || (pathname.startsWith("/campaign/") && pathname !== "/campaign/new")) {
    return null;
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background pb-safe md:hidden">
      <div className="flex">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = pathname === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "flex flex-1 flex-col items-center gap-0.5 py-2 text-xs transition-colors",
                isActive
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="size-5" />
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
```

- [ ] **Step 2: Add BottomNav and responsive padding to layout**

Modify `app/layout.tsx`:

```tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Navbar } from "@/components/navbar";
import { BottomNav } from "@/components/bottom-nav";
import { Toaster } from "sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Mailcraft",
  description: "Personalized bulk email campaigns",
  manifest: "/manifest.json",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Navbar />
        <main className="flex-1 pb-16 md:pb-0">{children}</main>
        <BottomNav />
        <Toaster position="top-center" richColors />
      </body>
    </html>
  );
}
```

Key changes:
- Import and render `<BottomNav />`
- Add `pb-16 md:pb-0` to `<main>` for bottom nav clearance on mobile

- [ ] **Step 3: Also add padding to the login page to avoid bottom nav overlap**

Read `app/login/page.tsx` and verify it has padding. If not, add `pb-16 md:pb-0` to its container.

- [ ] **Step 4: Verify**

Run the app. On mobile viewport (<768px):
- Bottom tab bar visible with 3 tabs
- Active tab icon is teal
- Tabs navigate correctly
- Campaign detail pages (`/campaign/[id]`) hide the bottom nav

- [ ] **Step 5: Commit**

```bash
git add components/bottom-nav.tsx app/layout.tsx
git commit -m "feat: add mobile bottom tab bar navigation"
```

---

### Task 4: Campaign Card — Teal Accent + Status Badges

**Files:**
- Modify: `components/campaign-card.tsx`
- Modify: `components/ui/badge.tsx` (add status variants)

- [ ] **Step 1: Add status badge color variants to badge.tsx**

The badge already has variants (default, secondary, destructive, outline, ghost). Add color-specific variants for campaign statuses. We use className directly on the Badge component since it already accepts className. Instead, update `campaign-card.tsx` to apply proper status colors.

- [ ] **Step 2: Rewrite CampaignCard with teal accent and proper badges**

```tsx
"use client";

import { Campaign } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const statusConfig: Record<string, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-muted text-muted-foreground" },
  sending: { label: "Sending", className: "bg-primary text-primary-foreground animate-pulse" },
  done: { label: "Done", className: "bg-green-600 text-white" },
  partial: { label: "Partial", className: "bg-amber-500 text-white" },
};

export function CampaignCard({ campaign }: { campaign: Campaign }) {
  const status = statusConfig[campaign.status] || statusConfig.draft;

  return (
    <Card className="cursor-pointer hover:shadow-lg transition-all duration-200 border-t-[3px] border-t-primary border-x border-b">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">{campaign.name}</CardTitle>
          <Badge className={status.className}>{status.label}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Created: {new Date(campaign.created_at).toLocaleDateString()}
        </p>
        <p className="text-sm text-muted-foreground truncate">
          Subject: {campaign.subject_template}
        </p>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: Verify**

Dashboard shows campaign cards with:
- Teal top accent border (3px)
- Colored status badges (teal for Sending with pulse, green for Done, amber for Partial)
- Hover shadow effect

- [ ] **Step 4: Commit**

```bash
git add components/campaign-card.tsx
git commit -m "feat: redesign campaign card with teal accent and status badge colors"
```

---

### Task 5: Dashboard — Stat Cards + Mobile Responsive

**Files:**
- Modify: `app/page.tsx`

- [ ] **Step 1: Redesign the Dashboard page**

```tsx
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Campaign } from "@/types";
import type { Session } from "@supabase/supabase-js";
import { CampaignCard } from "@/components/campaign-card";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Send, CheckCircle, AlertTriangle } from "lucide-react";

export default function Dashboard() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
      if (!session) router.push("/login");
    });
  }, []);

  useEffect(() => {
    if (!session) return;
    fetch("/api/campaigns")
      .then(r => {
        if (!r.ok) throw new Error("Failed to load campaigns");
        return r.json();
      })
      .then(setCampaigns)
      .catch(e => setError(e.message));
  }, [session]);

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm("Delete this campaign? This cannot be undone.")) return;
    try {
      const res = await fetch(`/api/campaigns/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      setCampaigns(prev => prev.filter(c => c.id !== id));
      toast.success("Campaign deleted");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to delete");
    }
  };

  if (loading) return <div className="p-8 text-center">Loading...</div>;
  if (!session) return null;

  const totalSent = campaigns.reduce((sum, c) => c.status === "done" ? sum + 1 : sum, 0);
  const totalPartial = campaigns.reduce((sum, c) => c.status === "partial" ? sum + 1 : sum, 0);

  return (
    <div className="container mx-auto p-4 md:p-6 pb-20 md:pb-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl md:text-3xl font-bold">Dashboard</h1>
        <Button onClick={() => router.push("/campaign/new")} className="hidden md:inline-flex">
          New Campaign
        </Button>
      </div>

      {error && <p className="text-destructive text-center mb-4">{error}</p>}

      {/* Stat cards */}
      <div className="grid grid-cols-3 gap-3 md:gap-4 mb-6">
        <div className="border border-border rounded-xl p-3 md:p-4 text-center">
          <Send className="size-5 md:size-6 mx-auto mb-1 text-primary" />
          <div className="text-xl md:text-2xl font-bold text-foreground">{campaigns.length}</div>
          <div className="text-xs md:text-sm text-muted-foreground">Total</div>
        </div>
        <div className="border border-border rounded-xl p-3 md:p-4 text-center">
          <CheckCircle className="size-5 md:size-6 mx-auto mb-1 text-green-600" />
          <div className="text-xl md:text-2xl font-bold text-foreground">{totalSent}</div>
          <div className="text-xs md:text-sm text-muted-foreground">Sent</div>
        </div>
        <div className="border border-border rounded-xl p-3 md:p-4 text-center">
          <AlertTriangle className="size-5 md:size-6 mx-auto mb-1 text-amber-500" />
          <div className="text-xl md:text-2xl font-bold text-foreground">{totalPartial}</div>
          <div className="text-xs md:text-sm text-muted-foreground">Partial</div>
        </div>
      </div>

      {/* Campaign grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {campaigns.map(c => (
          <div key={c.id} className="relative">
            <div onClick={() => router.push(`/campaign/${c.id}`)}>
              <CampaignCard campaign={c} />
            </div>
            <Button
              variant="ghost"
              size="xs"
              className="absolute top-2 right-2 text-muted-foreground hover:text-destructive"
              onClick={(e) => handleDelete(e, c.id)}
            >
              Delete
            </Button>
          </div>
        ))}
      </div>

      {campaigns.length === 0 && !error && (
        <p className="text-center text-muted-foreground mt-12">
          No campaigns yet. Create your first one!
        </p>
      )}

      {/* Mobile FAB */}
      <Button
        onClick={() => router.push("/campaign/new")}
        className="fixed bottom-20 right-4 md:hidden rounded-full size-14 shadow-lg"
        size="icon"
      >
        <Plus className="size-6" />
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: Verify**

Desktop: 3-column stat cards row + campaign grid. Mobile: stat cards in a row, FAB button visible, bottom nav present.

- [ ] **Step 3: Commit**

```bash
git add app/page.tsx
git commit -m "feat: redesign dashboard with stat cards, FAB, and mobile responsiveness"
```

---

### Task 6: Campaign Detail Page — Two-Column Desktop + Mobile Stacked

**Files:**
- Modify: `app/campaign/[id]/page.tsx`

- [ ] **Step 1: Redesign campaign detail layout**

Replace the return JSX in `app/campaign/[id]/page.tsx` (lines 145-169) with:

```tsx
  const total = recipients.length;
  const sent = recipients.filter(r => r.status === "sent").length;

  return (
    <div className="container mx-auto p-4 md:p-6 pb-20 md:pb-6">
      {/* Header section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">{campaign.name}</h1>
          <Badge className={
            campaign.status === "draft" ? "bg-muted text-muted-foreground" :
            campaign.status === "sending" ? "bg-primary text-primary-foreground animate-pulse" :
            campaign.status === "done" ? "bg-green-600 text-white" :
            "bg-amber-500 text-white"
          }>{campaign.status}</Badge>
        </div>
        <div className="flex gap-2">
          {campaign.status === "draft" && <Button onClick={handleSend} disabled={sending}>{sending ? "Sending..." : "Send Now"}</Button>}
          {campaign.status === "sending" && <Button variant="outline" onClick={handleRetry} disabled={sending}>{sending ? "Working..." : "Reset to Draft"}</Button>}
          {campaign.status === "partial" && <Button variant="outline" onClick={handleRetry} disabled={sending}>{sending ? "Working..." : "Retry Failed"}</Button>}
          <Button variant="destructive" onClick={handleDelete}>Delete</Button>
        </div>
      </div>

      {error && <p className="text-destructive mb-4">{error}</p>}

      {/* Two-column layout: left info + progress, right recipients */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left column: campaign info */}
        <div className="md:col-span-1 space-y-4">
          <div className="border border-border rounded-xl p-4">
            <p className="text-sm text-muted-foreground mb-1">Subject</p>
            <p className="text-sm font-medium break-words">{campaign.subject_template}</p>
          </div>
          <div className="border border-border rounded-xl p-4">
            <p className="text-sm text-muted-foreground mb-2">Progress</p>
            <ProgressBar sent={sent} total={total} />
          </div>
        </div>

        {/* Right column: recipient table */}
        <div className="md:col-span-2">
          <RecipientTable recipients={recipients} />
        </div>
      </div>
    </div>
  );
```

- [ ] **Step 2: Verify**

Desktop: Two columns — info + progress on left, recipient table on right. Mobile: Single column stacked.

- [ ] **Step 3: Commit**

```bash
git add app/campaign/\[id\]/page.tsx
git commit -m "feat: responsive campaign detail with two-column desktop layout"
```

---

### Task 7: Campaign Wizard — Mobile-Friendly

**Files:**
- Modify: `components/campaign-wizard/wizard.tsx`

- [ ] **Step 1: Update wizard with compact step indicator and bottom-fixed nav**

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { WizardData } from "@/types";
import { cn } from "@/lib/utils";

interface WizardStep {
  title: string;
  render: (props: { data: WizardData; updateData: (d: Partial<WizardData>) => void }) => React.ReactNode;
}

const STORAGE_KEY = "mailcraft-wizard-data";

function loadSavedData(): Partial<WizardData> {
  if (typeof window === "undefined") return {};
  try {
    const saved = sessionStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : {};
  } catch { return {}; }
}

export function Wizard({ steps, onComplete, loading }: { steps: WizardStep[]; onComplete: (data: WizardData) => void; loading?: boolean }) {
  const [currentStep, setCurrentStep] = useState(0);
  const [data, setData] = useState<WizardData>(loadSavedData as unknown as WizardData);

  const updateData = (partial: Partial<WizardData>) => {
    setData((prev: WizardData) => {
      const next = { ...prev, ...partial };
      try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  };

  const next = () => {
    if (currentStep < steps.length - 1) setCurrentStep(currentStep + 1);
    else onComplete(data);
  };

  const prev = () => {
    if (currentStep > 0) setCurrentStep(currentStep - 1);
  };

  const CurrentStep = steps[currentStep];

  return (
    <div className="max-w-3xl mx-auto px-4 py-4 md:py-6 pb-24 md:pb-6">
      <p className="text-xs text-muted-foreground mb-3 text-center">Progress saved in this tab</p>

      {/* Compact step indicator */}
      <div className="flex items-center justify-center gap-2 mb-6">
        {steps.map((s, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className={cn(
              "size-7 rounded-full flex items-center justify-center text-xs font-medium transition-colors",
              i <= currentStep
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground"
            )}>
              {i + 1}
            </div>
            <span className={cn(
              "text-xs hidden md:inline transition-colors",
              i === currentStep ? "text-foreground font-medium" : "text-muted-foreground"
            )}>
              {s.title}
            </span>
            {i < steps.length - 1 && (
              <div className={cn(
                "h-px w-4 md:w-8",
                i < currentStep ? "bg-primary" : "bg-muted"
              )} />
            )}
          </div>
        ))}
      </div>

      {/* Step content */}
      <div className="mb-6">
        {CurrentStep.render({ data, updateData })}
      </div>

      {/* Bottom-fixed nav buttons */}
      <div className="fixed bottom-0 left-0 right-0 bg-background border-t p-4 md:static md:border-0 md:p-0 md:bg-transparent md:flex md:justify-between md:gap-4">
        <div className="flex gap-3 max-w-3xl mx-auto md:mx-0 md:w-full md:flex md:justify-between">
          <Button
            variant="outline"
            onClick={prev}
            disabled={currentStep === 0 || loading}
            className="flex-1 md:flex-initial"
          >
            Back
          </Button>
          <Button
            onClick={next}
            disabled={loading}
            className="flex-1 md:flex-initial"
          >
            {loading ? "Saving..." : currentStep < steps.length - 1 ? "Next" : "Save Campaign"}
          </Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add bottom padding to the new campaign page**

In `app/campaign/new/page.tsx`, change the container padding to account for the wizard's own bottom padding. The wizard already has `pb-24 md:pb-6` so no layout change needed.

- [ ] **Step 3: Verify**

Desktop: Step indicator shows numbered circles + text labels, nav buttons at bottom of content. Mobile: Compact numbered circles, hidden labels on mobile, nav buttons fixed at bottom of viewport.

- [ ] **Step 4: Commit**

```bash
git add components/campaign-wizard/wizard.tsx
git commit -m "feat: mobile-friendly wizard with compact stepper and fixed bottom nav"
```

---

### Task 8: Progress Bar — Teal Fill

**Files:**
- Modify: `components/progress-bar.tsx`

- [ ] **Step 1: Update progress bar with teal fill**

The component already uses `bg-primary` for the fill bar. Since `--primary` is now teal, it should already work. Let's just add some polish:

```tsx
"use client";

export function ProgressBar({ sent, total }: { sent: number; total: number }) {
  const pct = total > 0 ? Math.round((sent / total) * 100) : 0;
  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="text-muted-foreground">{sent} of {total} sent</span>
        <span className="font-medium text-primary">{pct}%</span>
      </div>
      <div className="w-full bg-muted rounded-full h-2.5 overflow-hidden">
        <div
          className="bg-primary h-full rounded-full transition-all duration-500 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
```

Key changes:
- Percentage text now uses `text-primary` (teal)
- Filled track uses `transition-all duration-500 ease-out` for smooth animation
- Slightly thinner bar (`h-2.5` instead of `h-3`)

- [ ] **Step 2: Commit**

```bash
git add components/progress-bar.tsx
git commit -m "feat: teal progress bar with smooth animation"
```

---

### Task 9: Dialog — Teal Accent + Responsive Mobile

**Files:**
- Modify: `components/ui/dialog.tsx`

- [ ] **Step 1: Add teal accent to DialogOverlay and DialogContent**

The dialog already uses CSS variables for styling. Since `--ring` and `--primary` are teal, the focus rings and primary buttons in dialogs will already be teal. Add a subtle teal accent to the overlay:

In the `DialogOverlay` component, update the className to use a teal-tinted backdrop:

```tsx
function DialogOverlay({
  className,
  ...props
}: DialogPrimitive.Backdrop.Props) {
  return (
    <DialogPrimitive.Backdrop
      data-slot="dialog-overlay"
      className={cn(
        "fixed inset-0 isolate z-50 bg-[oklch(0.55_0.12_190_/_0.15)] duration-100 supports-backdrop-filter:blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
        className
      )}
      {...props}
    />
  )
}
```

In `DialogContent`, make the popup slightly more responsive on mobile (already has `max-w-[calc(100%-2rem)]` on mobile, `sm:max-w-sm` on desktop — this is good).

Add a teal top accent bar to the dialog header:

```tsx
function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn(
        "flex flex-col gap-2 border-t-[3px] border-t-primary rounded-t-xl pt-2",
        className
      )}
      {...props}
    />
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/ui/dialog.tsx
git commit -m "feat: teal accent on dialog overlay and header"
```

---

### Task 10: Settings Page — Responsive

**Files:**
- Modify: `app/settings/page.tsx`

- [ ] **Step 1: Add responsive padding to the settings container**

The settings page at `app/settings/page.tsx` currently uses `p-6 max-w-2xl`. Update to:

```tsx
    <div className="container mx-auto p-4 md:p-6 pb-20 md:pb-6 max-w-2xl">
```

- [ ] **Step 2: Verify**

The settings page should have:
- Mobile: `p-4 pb-20` (bottom padding for nav clearance)
- Desktop: `md:p-6 md:pb-6` (normal padding)
- Card layout centered with `max-w-2xl`

- [ ] **Step 3: Commit**

```bash
git add app/settings/page.tsx
git commit -m "feat: responsive settings page padding"
```

---

### Task 11: Polish & Micro-interactions

**Files:**
- Modify: `app/globals.css` (add animation keyframes if needed)

- [ ] **Step 1: Add teal glow focus style**

In `app/globals.css` `@layer base`, add a custom focus style:

```css
@layer base {
  * {
    @apply border-border outline-ring/50;
  }
  body {
    @apply bg-background text-foreground;
  }
  html {
    @apply font-sans;
  }
  /* Teal focus ring enhancement */
  :focus-visible {
    @apply ring-[3px] ring-ring/50;
  }
}
```

(Note: `outline-ring/50` is already applied to `*` in the base layer by shadcn — verify teal ring appears on focus.)

- [ ] **Step 2: Add Sending badge pulse animation**

The Sending badge already uses `animate-pulse`. Verify it works with the teal badge. If the pulse is too subtle, add a custom keyframe in `app/globals.css`:

```css
@keyframes pulse-teal {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}
```

But `animate-pulse` from Tailwind should work fine.

- [ ] **Step 3: Verify build**

Run: `npm run build`
Fix any TypeScript or lint errors.

- [ ] **Step 4: Commit**

```bash
git add app/globals.css
git commit -m "style: polish focus rings and micro-interactions"
```

---

### Task 12: Final Verification

**Files:** None

- [ ] **Step 1: Run build**

```bash
npm run build 2>&1
```

Expected: No TypeScript errors, no lint errors, build succeeds.

- [ ] **Step 2: Run the app and check visually**

```bash
npm run dev
```

Checklist:
- [ ] Primary buttons are teal
- [ ] Navbar is teal on desktop, hidden on mobile
- [ ] Bottom tab bar visible on mobile, hidden on campaign detail pages
- [ ] Dashboard has stat cards + campaign cards with teal accent border
- [ ] Campaign detail has two-column layout on desktop
- [ ] Wizard shows compact step indicator on mobile with bottom-fixed nav
- [ ] Progress bar is teal with smooth animation
- [ ] Dialog backdrop has teal tint
- [ ] Focus rings are teal on inputs/buttons
- [ ] Settings page responsive
- [ ] Mobile FAB button visible on dashboard
