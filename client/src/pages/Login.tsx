import { useState, type FormEvent } from "react";
import { api, ApiError } from "../lib/api";
import { Button, Card, Input } from "../components/ui";

export function Login({ onSuccess }: { onSuccess: (email: string) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api.login(email, password);
      onSuccess(r.email);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <div className="grid flex-1 place-items-center px-6">
        <div className="w-full max-w-sm animate-rise">
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-lg bg-brand text-3xl font-black text-white">
              /
            </div>
            <h1 className="text-2xl tracking-tight text-ink">
              <span className="font-bold">SlashOps</span>{" "}
              <span className="font-light text-slate-500">Command Center</span>
            </h1>
            <p className="mt-1 text-sm text-slate-500">Sign in to continue</p>
          </div>

          <Card className="p-7">
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Email
                </label>
                <Input
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@example.com"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Password
                </label>
                <Input
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                />
              </div>

              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm font-medium text-red-700">
                  {error}
                </div>
              )}

              <Button type="submit" disabled={busy} className="w-full">
                {busy ? "Signing in…" : "Sign in"}
              </Button>
            </form>
          </Card>
          <p className="mt-6 text-center text-xs text-slate-400">
            Protected area · authorized administrators only
          </p>
        </div>
      </div>
      <footer className="py-5 text-center text-sm text-slate-500">
        Copyright © <span className="font-semibold text-slate-600">slashops</span> · All rights
        reserved.
      </footer>
    </div>
  );
}
