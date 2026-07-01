import { useEffect, useState } from "react";
import { api } from "./lib/api";
import { Login } from "./pages/Login";
import { Dashboard } from "./pages/Dashboard";

type AuthState = { status: "loading" } | { status: "out" } | { status: "in"; email: string };

export function App() {
  const [auth, setAuth] = useState<AuthState>({ status: "loading" });

  useEffect(() => {
    api
      .me()
      .then((r) => setAuth({ status: "in", email: r.email }))
      .catch(() => setAuth({ status: "out" }));
  }, []);

  if (auth.status === "loading") {
    return (
      <div className="grid min-h-screen place-items-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-violet-600" />
      </div>
    );
  }

  if (auth.status === "out") {
    return <Login onSuccess={(email) => setAuth({ status: "in", email })} />;
  }

  return (
    <Dashboard
      email={auth.email}
      onLogout={async () => {
        await api.logout().catch(() => {});
        setAuth({ status: "out" });
      }}
    />
  );
}
