"use client";

import React, { useEffect, useState } from "react";
import { apiFetch, apiGet } from "../../lib/api";

type Credential = {
  id: number;
  provider: string;
  masked_key: string;
  is_active: boolean;
};

const PROVIDERS = [
  { id: "gemini", name: "Google Gemini", icon: "💎" },
  { id: "openai", name: "OpenAI", icon: "✨" },
  { id: "anthropic", name: "Anthropic Claude", icon: "🦉" },
  { id: "grok", name: "X.AI Grok", icon: "✖️" },
  { id: "ollama", name: "Ollama (Local)", icon: "🦙" },
];

export default function SettingsPage() {
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [keys, setKeys] = useState<Record<string, string>>({});

  useEffect(() => {
    loadCredentials();
  }, []);

  async function loadCredentials() {
    try {
      const data = await apiGet<Credential[]>("/credentials/");
      setCredentials(data);
    } catch (err) {
      console.error("Failed to load credentials", err);
    } finally {
      setLoading(false);
    }
  }

  async function saveKey(provider: string) {
    const api_key = keys[provider];
    if (!api_key) return;

    setSaving(provider);
    try {
      await apiFetch("/credentials/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider, api_key }),
      });
      setKeys((prev) => ({ ...prev, [provider]: "" }));
      await loadCredentials();
      alert(`Clé pour ${provider} enregistrée avec succès.`);
    } catch (err) {
      alert("Erreur lors de l'enregistrement de la clé.");
    } finally {
      setSaving(null);
    }
  }

  if (loading) return <div className="p-8 font-mono text-[#ff5c00]">Chargement du centre de sécurité...</div>;

  return (
    <div className="p-8 max-w-4xl mx-auto overflow-y-auto h-full">
      <header className="mb-12">
        <h1 className="text-4xl font-serif mb-4 flex items-center gap-3">
          <span className="text-[#ff5c00]">⚙️</span> Paramètres de Sécurité
        </h1>
        <p className="text-[#888] font-light max-w-2xl">
          Gérez vos identifiants API de manière centralisée. Vos clés sont chiffrées côté serveur 
          et ne sont jamais stockées en clair.
        </p>
      </header>

      <div className="grid gap-6">
        {PROVIDERS.map((p) => {
          const cred = credentials.find((c) => c.provider === p.id);
          return (
            <div 
              key={p.id}
              className="p-6 rounded border bg-black/40 backdrop-blur-sm transition-all hover:border-[#ff5c00]/40 group"
              style={{ borderColor: "var(--border-color)" }}
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded bg-white/5 flex items-center justify-center text-2xl group-hover:bg-[#ff5c00]/10 transition-colors">
                    {p.icon}
                  </div>
                  <div>
                    <h2 className="font-medium text-lg text-white">{p.name}</h2>
                    {cred ? (
                      <span className="text-xs font-mono text-[#4ade80] flex items-center gap-1">
                        <span className="w-1.5 h-1.5 bg-[#4ade80] rounded-full"></span>
                        ACTIF : {cred.masked_key}
                      </span>
                    ) : (
                      <span className="text-xs font-mono text-[#ff5c00]/60 italic">
                        Non configuré
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex gap-4 items-center flex-1 max-w-md">
                  <input
                    type="password"
                    placeholder="Nouvelle clé API..."
                    className="flex-1 bg-black border-b border-[#333] focus:border-[#ff5c00] outline-none px-3 py-2 text-sm font-mono transition-all"
                    value={keys[p.id] || ""}
                    onChange={(e) => setKeys({ ...keys, [p.id]: e.target.value })}
                  />
                  <button
                    onClick={() => saveKey(p.id)}
                    disabled={!keys[p.id] || saving === p.id}
                    className="btn btn-primary whitespace-nowrap"
                  >
                    {saving === p.id ? "Enregistrement..." : (cred ? "Mettre à jour" : "Enregistrer")}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <footer className="mt-16 p-6 border rounded border-[#ff5c00]/10 bg-[#ff5c00]/5">
        <h3 className="text-sm font-bold text-[#ff5c00] uppercase tracking-widest mb-2">Note de sécurité</h3>
        <p className="text-xs text-[#888] leading-relaxed">
          Le Document Orchestrator utilise un algorithme de chiffrement AES-256 symétrique. 
          Les clés sont déchiffrées en mémoire uniquement lors de la transmission aux services LLM. 
          Si vous modifiez votre SECRET_KEY système, toutes ces clés devront être saisies de nouveau.
        </p>
      </footer>
    </div>
  );
}
