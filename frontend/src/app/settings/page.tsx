"use client";

import React, { useEffect, useState } from "react";
import { apiGet, apiPost } from "../../lib/api";

type AdminUser = {
  id: number;
  username: string;
  email: string;
  is_superuser: boolean;
  roles: string[];
};

type AuditEntry = {
  id: number;
  action: string;
  actor: string | null;
  task_id: number | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<"api" | "users" | "audit">("api");
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(false);
  
  // API Keys state
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
  const [newApiKey, setNewApiKey] = useState("");
  const [selectedProvider, setSelectedProvider] = useState("gemini");

  const loadAdminData = async () => {
    setLoading(true);
    try {
      const [usersData, logsData] = await Promise.all([
        apiGet<{ users: AdminUser[] }>("/admin/users/").catch(() => ({ users: [] })),
        apiGet<{ logs: AuditEntry[] }>("/admin/audit/").catch(() => ({ logs: [] })),
      ]);
      setAdminUsers(usersData.users);
      setAuditLogs(logsData.logs);
    } catch (err) {
      console.error("Admin load failed", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Load local storage keys
    const providers = ["openai", "gemini", "anthropic", "grok"];
    const stored: Record<string, string> = {};
    providers.forEach(p => {
      const val = window.localStorage.getItem(`apiKey_${p}`);
      if (val) stored[p] = val;
    });
    setApiKeys(stored);

    loadAdminData();
  }, []);

  const saveKey = () => {
    if (!newApiKey.trim()) return;
    window.localStorage.setItem(`apiKey_${selectedProvider}`, newApiKey.trim());
    setApiKeys({ ...apiKeys, [selectedProvider]: newApiKey.trim() });
    setNewApiKey("");
    alert(`Clé ${selectedProvider} enregistrée localement.`);
  };

  const deleteKey = (prov: string) => {
    window.localStorage.removeItem(`apiKey_${prov}`);
    const updated = { ...apiKeys };
    delete updated[prov];
    setApiKeys(updated);
  };

  const updateUserRole = async (userId: number, role: string) => {
    try {
      await apiPost(`/admin/users/${userId}/role/`, { role });
      loadAdminData();
    } catch (err) {
      alert("Erreur lors de la mise à jour du rôle.");
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-8 bg-[var(--bg-primary)]">
      <header className="mb-10">
        <h1 className="text-4xl font-serif mb-2">Paramètres</h1>
        <p className="text-[#888] font-mono uppercase tracking-widest text-xs">Configuration du système et sécurité</p>
      </header>

      {/* Tabs */}
      <div className="flex gap-8 border-b border-[var(--border-color)] mb-8">
        <button 
          onClick={() => setActiveTab("api")}
          className={`pb-4 text-xs font-mono uppercase tracking-widest transition-all ${activeTab === "api" ? "text-[#ff5c00] border-b-2 border-[#ff5c00]" : "text-[#555] hover:text-[#888]"}`}
        >
          Fournisseurs IA
        </button>
        <button 
          onClick={() => setActiveTab("users")}
          className={`pb-4 text-xs font-mono uppercase tracking-widest transition-all ${activeTab === "users" ? "text-[#ff5c00] border-b-2 border-[#ff5c00]" : "text-[#555] hover:text-[#888]"}`}
        >
          Utilisateurs
        </button>
        <button 
          onClick={() => setActiveTab("audit")}
          className={`pb-4 text-xs font-mono uppercase tracking-widest transition-all ${activeTab === "audit" ? "text-[#ff5c00] border-b-2 border-[#ff5c00]" : "text-[#555] hover:text-[#888]"}`}
        >
          Journal d'Audit
        </button>
      </div>

      <div className="max-w-4xl">
        {activeTab === "api" && (
          <section className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
             <div className="panel border border-[var(--border-color)] p-6 rounded-xl bg-[var(--bg-secondary)]">
                <h2 className="text-xl font-serif mb-6">Configuration des Clés API</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-end">
                   <div>
                      <label className="text-[10px] text-[#888] uppercase tracking-widest font-mono mb-1 block">Provider</label>
                      <select className="input w-full" value={selectedProvider} onChange={(e) => setSelectedProvider(e.target.value)}>
                        <option value="gemini">Google Gemini</option>
                        <option value="openai">OpenAI</option>
                        <option value="anthropic">Anthropic</option>
                        <option value="grok">xAI Grok</option>
                      </select>
                   </div>
                   <div>
                      <label className="text-[10px] text-[#888] uppercase tracking-widest font-mono mb-1 block">Clé API (Secret)</label>
                      <input 
                        type="password" 
                        placeholder="sk-..." 
                        className="input w-full" 
                        value={newApiKey}
                        onChange={(e) => setNewApiKey(e.target.value)}
                      />
                   </div>
                   <button onClick={saveKey} className="btn primary w-full py-3 font-bold uppercase tracking-widest text-xs">Enregistrer la clé</button>
                </div>
                <p className="mt-4 text-[10px] text-[#555] italic">Les clés sont stockées localement dans votre navigateur et ne sont jamais sauvegardées en base de données sur le serveur.</p>
             </div>

             <div className="space-y-4">
                <h3 className="text-xs font-mono text-[#888] uppercase tracking-widest">Connecteurs Actifs</h3>
                {Object.keys(apiKeys).length === 0 && <p className="text-sm text-[#555] italic">Aucune clé configurée.</p>}
                {Object.entries(apiKeys).map(([prov, key]) => (
                   <div key={prov} className="flex items-center justify-between p-4 bg-black/20 border border-[var(--border-color)] rounded-lg">
                      <div className="flex items-center gap-4">
                        <div className="w-8 h-8 rounded bg-white/5 flex items-center justify-center text-lg uppercase font-bold text-[#ff5c00]">{prov[0]}</div>
                        <div className="flex flex-col">
                          <span className="text-sm font-bold uppercase tracking-widest">{prov}</span>
                          <span className="text-[10px] font-mono text-[#555]">MODÈLES : {prov === 'gemini' ? 'Pro, Flash' : 'GPT-4, Claude-3'}</span>
                        </div>
                      </div>
                      <button onClick={() => deleteKey(prov)} className="text-[#ef4444] text-[10px] font-mono uppercase tracking-widest hover:underline">Révoquer</button>
                   </div>
                ))}
             </div>
          </section>
        )}

        {activeTab === "users" && (
          <section className="animate-in fade-in slide-in-from-bottom-2 duration-300">
             <div className="panel border border-[var(--border-color)] rounded-xl bg-[var(--bg-secondary)] overflow-hidden">
                <table className="w-full text-left">
                  <thead className="bg-black/40 border-b border-[var(--border-color)]">
                    <tr>
                      <th className="p-4 text-[10px] font-mono uppercase tracking-widest text-[#888]">Utilisateur</th>
                      <th className="p-4 text-[10px] font-mono uppercase tracking-widest text-[#888]">Rôles Actuels</th>
                      <th className="p-4 text-[10px] font-mono uppercase tracking-widest text-[#888]">Modifier Rôle</th>
                    </tr>
                  </thead>
                  <tbody>
                    {adminUsers.map((user) => (
                      <tr key={user.id} className="border-b border-[var(--border-color)] last:border-0 hover:bg-white/5 transition-colors">
                        <td className="p-4">
                           <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#ff5c00]/20 to-[#ff5c00]/5 flex items-center justify-center text-xs font-bold text-[#ff5c00] border border-[#ff5c00]/20">{user.username[0].toUpperCase()}</div>
                              <span className="text-sm font-medium">{user.username} {user.is_superuser && <span className="text-[9px] bg-red-900/30 text-red-500 px-1 py-0.5 rounded border border-red-500/20">ROOT</span>}</span>
                           </div>
                        </td>
                        <td className="p-4">
                           <div className="flex gap-1">
                              {user.roles.map(r => <span key={r} className="text-[9px] bg-white/5 px-2 py-0.5 rounded border border-white/10 uppercase font-mono">{r}</span>)}
                           </div>
                        </td>
                        <td className="p-4">
                           <select 
                            className="bg-transparent border border-[var(--border-color)] text-[10px] uppercase font-mono px-2 py-1 rounded focus:border-[#ff5c00] outline-none"
                            onChange={(e) => updateUserRole(user.id, e.target.value)}
                            defaultValue={user.roles[0] || ""}
                           >
                              <option value="manager">Manager</option>
                              <option value="viewer">Viewer</option>
                              <option value="admin">Admin</option>
                           </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
             </div>
          </section>
        )}

        {activeTab === "audit" && (
          <section className="animate-in fade-in slide-in-from-bottom-2 duration-300">
             <div className="panel border border-[var(--border-color)] rounded-xl bg-[var(--bg-secondary)] overflow-hidden">
                <div className="max-h-[600px] overflow-y-auto">
                   {auditLogs.map((log) => (
                      <div key={log.id} className="p-4 border-b border-[var(--border-color)] last:border-0 flex items-start justify-between gap-4">
                         <div className="flex items-start gap-4">
                            <div className="w-8 h-8 shrink-0 flex items-center justify-center text-lg">📝</div>
                            <div>
                               <p className="text-sm font-medium text-white">{log.action}</p>
                               <div className="flex gap-3 mt-1 items-center">
                                  <span className="text-[10px] font-mono text-[#ff5c00] uppercase tracking-widest">ACTEUR: {log.actor || 'Système'}</span>
                                  {log.task_id && <span className="text-[10px] font-mono text-[#555] uppercase tracking-widest">TASK: DOC-{log.task_id}</span>}
                               </div>
                            </div>
                         </div>
                         <span className="text-[10px] font-mono text-[#555] whitespace-nowrap">{new Date(log.created_at).toLocaleString()}</span>
                      </div>
                   ))}
                   {auditLogs.length === 0 && <div className="p-10 text-center text-[#555] italic">Aucun événement d'audit enregistré.</div>}
                </div>
             </div>
          </section>
        )}
      </div>
    </div>
  );
}
