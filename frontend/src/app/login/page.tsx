"use client";

import React, { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost } from "../../lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("admin12345");
  const [busy, setBusy] = useState(false);

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const response = await apiPost<{ token: string; access?: string; refresh?: string }>("/auth/login/", {
        username,
        password,
      });
      window.localStorage.setItem("authToken", response.token);
      if (response.access) window.localStorage.setItem("jwtAccess", response.access);
      if (response.refresh) window.localStorage.setItem("jwtRefresh", response.refresh);
      router.push("/");
    } catch (err) {
      console.error("Login failed", err);
      alert("Identifiants incorrects ou serveur indisponible.");
    } finally {
      setBusy(false);
    }
  }

  async function registerAndLogin() {
    setBusy(true);
    try {
      await apiPost<{ token: string; access?: string; refresh?: string }>("/auth/register/", {
        username,
        password,
        role: "manager",
      });
      const response = await apiPost<{ token: string; access?: string; refresh?: string }>("/auth/login/", {
        username,
        password,
      });
      window.localStorage.setItem("authToken", response.token);
      if (response.access) window.localStorage.setItem("jwtAccess", response.access);
      if (response.refresh) window.localStorage.setItem("jwtRefresh", response.refresh);
      router.push("/");
    } catch (err) {
      console.error("Registration failed", err);
      alert("Erreur lors de l'inscription. L'utilisateur existe peut-être déjà.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen w-full items-center justify-center p-6 bg-black">
      <section className="panel w-full max-w-sm border border-[var(--border-color)] p-8 rounded-xl bg-[var(--bg-secondary)] shadow-2xl">
        <div className="flex justify-center mb-6">
          <div className="w-12 h-12 rounded-lg bg-[#ff5c00] flex items-center justify-center text-black font-bold text-xl shadow-[0_0_20px_rgba(255,92,0,0.3)]">AI</div>
        </div>
        <h1 className="text-3xl font-serif mb-2 text-center">AI DOC ORCHESTRATOR</h1>
        <p className="text-sm text-[#888888] mb-8 text-center uppercase tracking-widest font-mono">Accès sécurisé</p>
        
        <form className="grid gap-6" onSubmit={handleLogin}>
          <div>
            <label className="text-xs text-[#888] mb-2 block uppercase tracking-wider font-mono">Nom d'utilisateur</label>
            <input 
              className="input w-full bg-black/50 border-[var(--border-color)] text-white focus:border-[#ff5c00] transition-colors" 
              value={username} 
              onChange={(e) => setUsername(e.target.value)} 
              placeholder="Ex: admin"
              autoFocus
            />
          </div>
          <div>
            <label className="text-xs text-[#888] mb-2 block uppercase tracking-wider font-mono">Mot de passe</label>
            <input 
              className="input w-full bg-black/50 border-[var(--border-color)] text-white focus:border-[#ff5c00] transition-colors" 
              type="password" 
              value={password} 
              onChange={(e) => setPassword(e.target.value)} 
              placeholder="••••••••" 
            />
          </div>
          <button className="btn primary w-full py-3 text-sm font-bold tracking-widest mt-2" disabled={busy}>
            {busy ? "CONNEXION..." : "SE CONNECTER"}
          </button>
          <button 
            type="button" 
            className="text-xs text-[#555] hover:text-[#ff5c00] transition-colors uppercase tracking-widest font-mono text-center" 
            onClick={registerAndLogin}
            disabled={busy}
          >
            Créer un compte manager
          </button>
        </form>
      </section>
    </main>
  );
}
