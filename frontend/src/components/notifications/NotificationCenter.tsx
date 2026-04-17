"use client";

import React, { useEffect, useState } from "react";
import { apiGet, apiPost } from "../../lib/api";

type Notification = {
  id: number;
  workflow: number;
  workflow_title: string;
  message: string;
  status: "pending" | "approved" | "rejected" | "read";
  created_at: string;
};

export default function NotificationCenter() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadNotifications() {
    try {
      const data = await apiGet<any>("/notifications/");
      setNotifications(Array.isArray(data) ? data : (data?.results || []));
    } catch (err) {
      console.error("Failed to load notifications", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadNotifications();
    const interval = setInterval(loadNotifications, 15000);
    return () => clearInterval(interval);
  }, []);

  async function handleAction(workflowId: number, action: "approve" | "reject", feedback: string = "") {
    try {
      await apiPost(`/workflows/${workflowId}/${action}/`, { feedback });
      loadNotifications();
    } catch (err) {
      alert("Erreur lors de l'action : " + err);
    }
  }

  const safeNotifications = Array.isArray(notifications) ? notifications : [];
  const pending = safeNotifications.filter(n => n?.status === "pending");

  if (loading && safeNotifications.length === 0) return null;

  return (
    <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl overflow-hidden mb-8">
      <div className="p-4 border-b border-[var(--border-color)] bg-[#ff5c00]/10 flex items-center justify-between">
        <h2 className="text-sm font-serif font-bold text-[#ff5c00] flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#ff5c00] opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-[#ff5c00]"></span>
          </span>
          Notifications & Approbations ({pending.length})
        </h2>
      </div>
      <div className="divide-y divide-[var(--border-color)]">
        {pending.length === 0 ? (
          <div className="p-6 text-center text-xs text-[#555] italic font-mono uppercase tracking-widest">
            Aucun livrable en attente
          </div>
        ) : (
          pending.map(n => (
            <div key={n.id} className="p-6 hover:bg-white/5 transition-colors">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="font-serif text-white mb-1">{n.workflow_title}</h3>
                  <p className="text-sm text-[#888]">{n.message}</p>
                </div>
                <span className="text-[10px] text-[#555] font-mono">{new Date(n.created_at).toLocaleString()}</span>
              </div>
              <div className="flex gap-4">
                <button 
                  onClick={() => handleAction(n.workflow, "approve")}
                  className="px-4 py-2 bg-[#10b981] text-black text-[10px] font-black uppercase tracking-tighter rounded hover:bg-[#059669] transition-colors"
                >
                  Approuver & Finaliser ✅
                </button>
                <button 
                  onClick={() => {
                    const feedback = prompt("Raison du refus / Modifications demandées :");
                    if (feedback) handleAction(n.workflow, "reject", feedback);
                  }}
                  className="px-4 py-2 bg-[#ef4444] text-white text-[10px] font-black uppercase tracking-tighter rounded hover:bg-[#dc2626] transition-colors"
                >
                  Renvoyer au CEO 🔄
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
