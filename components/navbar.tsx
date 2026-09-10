"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Mail, LayoutDashboard, Plus, Settings, User } from "lucide-react";

const navLinks = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/campaign/new", label: "New Campaign", icon: Plus },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Navbar() {
  const pathname = usePathname();

  // Hide on login screen
  if (pathname === "/login") return null;

  return (
    <header className="bg-card/90 backdrop-blur-md border-b border-border/70 sticky top-0 z-40 hidden md:block">
      <div className="container mx-auto flex items-center justify-between px-6 h-16">
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="size-9 rounded-lg bg-primary flex items-center justify-center text-primary-foreground shadow-sm shadow-primary/25 group-hover:scale-105 transition-transform">
              <Mail className="size-5" />
            </div>
            <div className="flex flex-col">
              <span className="text-base font-bold tracking-tight text-foreground leading-tight">
                Mailcraft
              </span>
              <span className="text-[10px] uppercase font-semibold tracking-wider text-muted-foreground">
                Email Dispatch
              </span>
            </div>
          </Link>

          <nav className="flex items-center gap-1">
            {navLinks.map((link) => {
              const Icon = link.icon;
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-all",
                    isActive
                      ? "bg-primary/10 text-primary shadow-xs"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                  )}
                >
                  <Icon className={cn("size-4", isActive ? "text-primary" : "text-muted-foreground")} />
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          {pathname !== "/campaign/new" && (
            <Link
              href="/campaign/new"
              className="inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 shadow-xs hover:shadow-sm active:scale-[0.98] transition-all duration-150"
            >
              <Plus className="size-3.5" />
              <span>Create Campaign</span>
            </Link>
          )}

          <Link
            href="/settings"
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border/70 bg-background/80 hover:bg-muted/60 text-xs font-medium text-muted-foreground hover:text-foreground active:scale-[0.98] transition-all duration-150"
          >
            <User className="size-3.5 text-muted-foreground" />
            <span>Account</span>
          </Link>
        </div>
      </div>
    </header>
  );
}
