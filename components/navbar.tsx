"use client";

import Link from "next/link";

export function Navbar() {
  return (
    <nav className="border-b">
      <div className="container mx-auto flex items-center justify-between px-4 py-3">
        <Link href="/" className="text-lg font-bold hover:text-primary transition-colors">
          Mailcraft
        </Link>
        <Link
          href="/settings"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Settings
        </Link>
      </div>
    </nav>
  );
}
