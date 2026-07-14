"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  const supabase = createClient();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
    if (authError) {
      const { error: signUpError } = await supabase.auth.signUp({ email, password });
      if (signUpError) {
        setError(signUpError.message);
      } else {
        setError("Account created! Check your email to confirm, or try logging in again.");
      }
    } else {
      router.push("/");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center">
      <form onSubmit={handleLogin} className="w-full max-w-sm space-y-4 p-6">
        <h1 className="text-2xl font-bold text-center">Mailcraft</h1>
        <p className="text-sm text-muted-foreground text-center">Sign in to manage campaigns</p>
        <Input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required />
        <Input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} required />
        {error && <p className="text-sm text-red-500">{error}</p>}
        <Button type="submit" className="w-full" disabled={loading}>{loading ? "Loading..." : "Sign In / Sign Up"}</Button>
      </form>
    </div>
  );
}
