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
