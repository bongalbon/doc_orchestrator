const state = {
  agents: {},
  models: {},
  currentTitle: "Document",
  theme: "dark",
  sidebarCollapsed: false,
  archiveDetail: null,
  archivesById: {},
};

const $ = (id) => document.getElementById(id);

function toast(message, type = "info") {
  const root = $("toast-root");
  if (!root) return;
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.textContent = message;
  root.appendChild(el);
  setTimeout(() => {
    el.style.opacity = "0";
    setTimeout(() => el.remove(), 180);
  }, 2600);
}

function setTheme(theme) {
  state.theme = theme === "light" ? "light" : "dark";
  document.body.setAttribute("data-theme", state.theme);
  localStorage.setItem("oai_doc_theme", state.theme);
  const btn = $("theme-toggle-btn");
  if (btn) btn.textContent = state.theme === "dark" ? "🌙 Sombre" : "☀️ Clair";
}

function toggleTheme() {
  setTheme(state.theme === "dark" ? "light" : "dark");
}

function setSidebarCollapsed(collapsed) {
  state.sidebarCollapsed = !!collapsed;
  document.body.classList.toggle("sidebar-collapsed", state.sidebarCollapsed);
  localStorage.setItem("oai_doc_sidebar_collapsed", state.sidebarCollapsed ? "1" : "0");
}

function toggleSidebar() {
  setSidebarCollapsed(!state.sidebarCollapsed);
}

function toggleNewAgentModal(force) {
  const panel = $("new-agent-modal");
  const btn = $("toggle-agent-form-btn");
  const shouldOpen = typeof force === "boolean" ? force : panel.classList.contains("hidden");
  panel.classList.toggle("hidden", !shouldOpen);
  if (btn) btn.textContent = shouldOpen
    ? "Fermer le formulaire agent"
    : "Créer ou ajouter un nouvel agent";
}

function setLoading(btn, loadingText = "Chargement...") {
  if (!btn) return () => {};
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = loadingText;
  return () => {
    btn.disabled = false;
    btn.textContent = original;
  };
}

function refreshEditorMetrics() {
  const txt = $("preview-editor")?.value || "";
  const words = txt.trim() ? txt.trim().split(/\s+/).length : 0;
  $("editor-metrics").textContent = `${words} mots • ${txt.length} caractères`;
}

function renderMarkdown(md = "") {
  const escapeHtml = (s) => s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  let html = escapeHtml(md);
  html = html.replace(/^### (.*)$/gm, "<h3>$1</h3>");
  html = html.replace(/^## (.*)$/gm, "<h2>$1</h2>");
  html = html.replace(/^# (.*)$/gm, "<h1>$1</h1>");
  html = html.replace(/^\*\*\*$/gm, "<hr>");
  html = html.replace(/^---$/gm, "<hr>");
  html = html.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.*?)\*/g, "<em>$1</em>");
  html = html.replace(/^\* (.*)$/gm, "<li>$1</li>");
  html = html.replace(/(<li>.*<\/li>)/gs, "<ul>$1</ul>");
  html = html.replace(/\n{2,}/g, "</p><p>");
  html = `<p>${html.replace(/\n/g, "<br>")}</p>`;
  html = html.replace(/<p>\s*<\/p>/g, "");
  html = html.replace(/<\/ul>\s*<ul>/g, "");
  return html;
}

function updatePreviewRender() {
  const txt = $("preview-editor").value || "";
  $("preview-rendered").innerHTML = renderMarkdown(txt);
}

function renderServiceBadges(services = {}) {
  const html = [
    `<span class="badge ${services.ollama ? "ok" : "ko"}">Ollama ${services.ollama ? "OK" : "OFF"}</span>`,
    `<span class="badge ${services.gemini ? "ok" : "ko"}">Gemini ${services.gemini ? "OK" : "OFF"}</span>`,
    `<span class="badge ${services.openai ? "ok" : "ko"}">OpenAI ${services.openai ? "OK" : "OFF"}</span>`,
  ].join("");
  $("service-badges").innerHTML = html;
}

function switchPage(pageId) {
  document.querySelectorAll(".page").forEach((p) => p.classList.remove("active"));
  document.querySelectorAll(".nav-btn").forEach((b) => b.classList.remove("active"));
  $(pageId).classList.add("active");
  document.querySelector(`[data-page="${pageId}"]`).classList.add("active");
}

function renderSkeletonCards() {
  $("stats-cards").innerHTML = `
    <div class="skeleton card"></div>
    <div class="skeleton card"></div>
    <div class="skeleton card"></div>
    <div class="skeleton card"></div>
  `;
}

function renderSkeletonList(targetId, count = 3) {
  const html = Array.from({ length: count }).map(() => `
    <div class="item">
      <div class="skeleton line" style="width:40%"></div>
      <div class="skeleton line" style="width:75%"></div>
      <div class="skeleton line" style="width:65%"></div>
    </div>
  `).join("");
  $(targetId).innerHTML = html;
}

function renderEmptyState(targetId, icon, title, subtitle = "") {
  $(targetId).innerHTML = `
    <div class="empty-state">
      <span class="icon">${icon}</span>
      <strong>${title}</strong>
      <div class="muted">${subtitle}</div>
    </div>
  `;
}

function renderSteps(targetId, labels, activeIdx = -1, doneUntil = -1) {
  const html = labels.map((label, i) => {
    const cls = i <= doneUntil ? "step done" : (i === activeIdx ? "step active" : "step");
    return `<div class="${cls}">${i + 1}. ${label}</div>`;
  }).join("");
  $(targetId).innerHTML = html;
}

function saveDraftToHistory() {
  const content = $("preview-editor").value || "";
  if (!content.trim()) return;
  const title = ($("title-input").value || state.currentTitle || "Sans titre").trim();
  const entry = { id: Date.now().toString(), title, content, at: new Date().toISOString() };
  const existing = JSON.parse(localStorage.getItem("oai_doc_drafts") || "[]");
  localStorage.setItem("oai_doc_drafts", JSON.stringify([entry, ...existing].slice(0, 10)));
  refreshDraftHistory();
}

function refreshDraftHistory() {
  const drafts = JSON.parse(localStorage.getItem("oai_doc_drafts") || "[]");
  const select = $("draft-history-select");
  if (!drafts.length) {
    select.innerHTML = `<option value="">Aucun brouillon local</option>`;
    return;
  }
  select.innerHTML = `<option value="">Historique brouillons (${drafts.length})</option>` + drafts.map((d) => {
    const when = new Date(d.at).toLocaleString();
    return `<option value="${d.id}">${d.title} — ${when}</option>`;
  }).join("");
}

function restoreDraftFromHistory() {
  const id = $("draft-history-select").value;
  if (!id) return;
  const drafts = JSON.parse(localStorage.getItem("oai_doc_drafts") || "[]");
  const found = drafts.find((d) => d.id === id);
  if (!found) return;
  $("preview-editor").value = found.content || "";
  $("title-input").value = found.title || $("title-input").value;
  refreshEditorMetrics();
  toast("Brouillon restauré.", "success");
}

function confirmAction(message, title = "Confirmer l'action") {
  return new Promise((resolve) => {
    $("confirm-title").textContent = title;
    $("confirm-message").textContent = message;
    const modal = $("confirm-modal");
    modal.classList.remove("hidden");
    const onCancel = () => close(false);
    const onOk = () => close(true);
    const onEsc = (e) => { if (e.key === "Escape") close(false); };
    function close(val) {
      modal.classList.add("hidden");
      $("confirm-cancel-btn").removeEventListener("click", onCancel);
      $("confirm-ok-btn").removeEventListener("click", onOk);
      document.removeEventListener("keydown", onEsc);
      resolve(val);
    }
    $("confirm-cancel-btn").addEventListener("click", onCancel);
    $("confirm-ok-btn").addEventListener("click", onOk);
    document.addEventListener("keydown", onEsc);
  });
}

function openArchiveDetail(archive) {
  state.archiveDetail = archive;
  $("archive-detail-title").textContent = archive.titre || "Archive";
  $("archive-detail-meta").textContent = `${archive.type_doc || "-"} • ${archive.agent_utilise || "-"} • ${archive.statut || "-"}`;
  $("archive-detail-rendered").innerHTML = renderMarkdown(archive.contenu_md || "");
  $("archive-detail-modal").classList.remove("hidden");
}

function closeArchiveDetail() {
  $("archive-detail-modal").classList.add("hidden");
  state.archiveDetail = null;
}

async function jget(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

async function jsend(url, method, payload) {
  const r = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {}),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

async function loadStats() {
  renderSkeletonCards();
  const data = await jget("/api/stats");
  const s = data.stats;
  renderServiceBadges(data.services || {});
  $("stats-cards").innerHTML = `
    <div class="card"><div class="k">Documents</div><div class="v">${s.nb_documents}</div></div>
    <div class="card"><div class="k">Archives</div><div class="v">${s.nb_archives}</div></div>
    <div class="card"><div class="k">Validés</div><div class="v">${s.nb_valides}</div></div>
    <div class="card"><div class="k">Taille KB</div><div class="v">${s.taille_totale_kb}</div></div>
  `;
}

async function loadDocuments() {
  renderSkeletonList("documents-list", 3);
  const data = await jget("/api/documents");
  if (!data.documents.length) return renderEmptyState("documents-list", "📭", "Aucun document", "Ajoute des fichiers dans Ingestion.");
  $("documents-list").innerHTML = data.documents.map((d) => `
    <div class="item">
      <h4>${d.nom}</h4>
      <small>${d.type_fichier} • ${d.taille_kb} KB</small>
      <div class="row"><button class="btn btn-danger" onclick="deleteDoc('${d.id}')">Supprimer</button></div>
    </div>
  `).join("");
}

async function deleteDoc(id) {
  const ok = await confirmAction("Supprimer ce document ?", "Suppression document");
  if (!ok) return;
  await fetch(`/api/documents/${id}`, { method: "DELETE" });
  toast("Document supprimé.", "success");
  await loadDocuments();
  await loadStats();
}
window.deleteDoc = deleteDoc;

async function uploadFiles() {
  const files = $("upload-input").files;
  if (!files.length) return toast("Ajoute au moins un fichier.", "info");
  const stop = setLoading($("upload-btn"), "Upload...");
  renderSteps("ingestion-steps", ["Préparation", "Extraction", "Indexation"], 0, -1);
  const fd = new FormData();
  Array.from(files).forEach((f) => fd.append("files", f));
  try {
    renderSteps("ingestion-steps", ["Préparation", "Extraction", "Indexation"], 1, 0);
    const r = await fetch("/api/upload", { method: "POST", body: fd });
    const data = await r.json();
    renderSteps("ingestion-steps", ["Préparation", "Extraction", "Indexation"], 2, 1);
    $("upload-result").textContent = `Ingestion: ${data.ok} OK, ${data.ko} erreur(s).`;
    toast(`Ingestion terminée (${data.ok} OK / ${data.ko} KO).`, data.ko ? "info" : "success");
    await loadDocuments();
    await loadStats();
    renderSteps("ingestion-steps", ["Préparation", "Extraction", "Indexation"], -1, 2);
  } catch (e) {
    toast("Erreur upload: " + e.message, "error");
    renderSteps("ingestion-steps", ["Préparation", "Extraction", "Indexation"], -1, -1);
  } finally {
    stop();
  }
}

async function loadStudioData() {
  const [agentsData, modelsData] = await Promise.all([jget("/api/agents"), jget("/api/models")]);
  state.agents = agentsData.agents;
  state.models = modelsData.models;
  $("agent-select").innerHTML = Object.keys(state.agents).map((name) => `<option value="${name}">${state.agents[name].icon} ${name}</option>`).join("");
  $("model-select").innerHTML = Object.keys(state.models).map((k) => `<option value="${k}">${k}</option>`).join("");
  refreshDocTypes();
}

function refreshDocTypes() {
  const agent = $("agent-select").value;
  const types = (state.agents[agent] && state.agents[agent].doc_types) || ["Document"];
  $("doc-type-select").innerHTML = types.map((t) => `<option value="${t}">${t}</option>`).join("");
}

async function generateDoc() {
  const payload = {
    agent: $("agent-select").value,
    model_label: $("model-select").value,
    doc_type: $("doc-type-select").value,
    title: $("title-input").value || "Note",
    objective: $("objective-input").value,
    custom_instructions: $("instructions-input").value,
    use_rag: $("rag-toggle").checked,
    rag_k: Number($("rag-k").value || 5),
  };
  const stop = setLoading($("generate-btn"), "Génération...");
  renderSteps("generation-steps", ["Contexte", "Rédaction", "Finalisation"], 0, -1);
  try {
    renderSteps("generation-steps", ["Contexte", "Rédaction", "Finalisation"], 1, 0);
    const data = await jsend("/api/generate", "POST", payload);
    renderSteps("generation-steps", ["Contexte", "Rédaction", "Finalisation"], 2, 1);
    state.currentTitle = data.title || "Document";
    $("preview-editor").value = data.content || "";
    refreshEditorMetrics();
    updatePreviewRender();
    toast("Document généré.", "success");
    renderSteps("generation-steps", ["Contexte", "Rédaction", "Finalisation"], -1, 2);
  } catch (e) {
    toast("Erreur génération: " + e.message, "error");
    renderSteps("generation-steps", ["Contexte", "Rédaction", "Finalisation"], -1, -1);
  } finally {
    stop();
  }
}

async function saveEditedAsArchive() {
  const content = $("preview-editor").value;
  if (!content.trim()) return toast("Le document est vide.", "info");
  try {
    await jsend("/api/archives", "POST", {
      doc_type: $("doc-type-select").value,
      title: $("title-input").value || state.currentTitle || "Note",
      content,
      agent: $("agent-select").value,
      model_label: $("model-select").value,
    });
    saveDraftToHistory();
    toast("Version éditée sauvegardée.", "success");
  } catch (e) {
    toast("Erreur sauvegarde: " + e.message, "error");
  }
}

async function createAgent() {
  const payload = {
    name: $("new-agent-name").value,
    icon: $("new-agent-icon").value,
    description: $("new-agent-desc").value,
    system_prompt: $("new-agent-prompt").value,
    doc_types: $("new-agent-types").value,
  };
  const stop = setLoading($("create-agent-btn"), "Création...");
  try {
    await jsend("/api/agents", "POST", payload);
    await loadStudioData();
    ["new-agent-name", "new-agent-icon", "new-agent-desc", "new-agent-prompt", "new-agent-types"].forEach((id) => {
      if ($(id)) $(id).value = id === "new-agent-icon" ? "🧠" : "";
    });
    toggleNewAgentModal(false);
    toast("Agent créé.", "success");
  } catch (e) {
    toast("Erreur création agent: " + e.message, "error");
  } finally {
    stop();
  }
}

async function loadArchives() {
  renderSkeletonList("archives-list", 4);
  const status = $("archive-status-filter").value;
  const data = await jget(`/api/archives?status=${encodeURIComponent(status)}`);
  if (!data.archives.length) return renderEmptyState("archives-list", "🗂️", "Aucune archive", "Génère un document dans le Studio.");
  state.archivesById = Object.fromEntries(data.archives.map((a) => [a.id, a]));
  $("archives-list").innerHTML = data.archives.map((a) => {
    return `
      <div class="item">
        <div class="archive-row">
          <div><h4>${a.titre}</h4><small>${a.type_doc} • ${a.agent_utilise || "-"}</small></div>
          <div>${a.statut === "validé" ? '<span class="status-pill valid">Validé</span>' : '<span class="status-pill draft">Brouillon</span>'}</div>
          <div><small>${new Date(a.date_creation).toLocaleDateString()}</small></div>
          <div class="archive-actions">
            <button class="btn btn-ghost archive-view-btn" data-archive-id="${a.id}">Voir</button>
            ${a.statut === "validé" ? "" : `<button class="btn btn-secondary" onclick="validateArchive('${a.id}')">Valider</button>`}
            <button class="btn btn-danger" onclick="deleteArchive('${a.id}')">Supprimer</button>
          </div>
        </div>
      </div>
    `;
  }).join("");

  document.querySelectorAll(".archive-view-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const archive = state.archivesById[btn.dataset.archiveId];
      if (!archive) {
        toast("Archive introuvable.", "error");
        return;
      }
      openArchiveDetail(archive);
    });
  });
}

async function validateArchive(id) {
  const ok = await confirmAction("Valider cette archive ?", "Validation archive");
  if (!ok) return;
  await fetch(`/api/archives/${id}/validate`, { method: "POST" });
  toast("Archive validée.", "success");
  await loadArchives();
}
window.validateArchive = validateArchive;

async function deleteArchive(id) {
  const ok = await confirmAction("Supprimer cette archive ?", "Suppression archive");
  if (!ok) return;
  await fetch(`/api/archives/${id}`, { method: "DELETE" });
  toast("Archive supprimée.", "success");
  await loadArchives();
}
window.deleteArchive = deleteArchive;

async function runSearch() {
  const q = $("archive-search").value.trim();
  if (!q) {
    $("search-results").innerHTML = "";
    return;
  }
  const data = await jget(`/api/search?q=${encodeURIComponent(q)}&n=3`);
  if (!data.results.length) return renderEmptyState("search-results", "🔎", "Aucun résultat", "Essaie une autre requête.");
  $("search-results").innerHTML = data.results.map((r) => `
    <div class="item">
      <h4>${r.metadata?.doc_name || "Document"}</h4>
      <small>Pertinence ${(r.score * 100).toFixed(0)}%</small>
      <div>${(r.text || "").slice(0, 350)}</div>
    </div>
  `).join("");
}

async function loadConfig() {
  const cfg = await jget("/api/config");
  $("cfg-gemini").value = cfg.GEMINI_API_KEY || "";
  $("cfg-openai").value = cfg.OPENAI_API_KEY || "";
  $("cfg-ollama").value = cfg.OLLAMA_BASE_URL || "";
  $("cfg-custom").value = cfg.CUSTOM_MODEL || "";
  $("cfg-embed").value = cfg.EMBED_MODEL || "";
}

async function saveConfig() {
  const stop = setLoading($("save-config-btn"), "Sauvegarde...");
  try {
    await jsend("/api/config", "POST", {
      GEMINI_API_KEY: $("cfg-gemini").value,
      OPENAI_API_KEY: $("cfg-openai").value,
      OLLAMA_BASE_URL: $("cfg-ollama").value,
      CUSTOM_MODEL: $("cfg-custom").value,
      EMBED_MODEL: $("cfg-embed").value,
    });
    toast("Configuration sauvegardée.", "success");
  } catch (e) {
    toast("Erreur config: " + e.message, "error");
  } finally {
    stop();
  }
}

async function exportContent(kind, content, title) {
  const safeTitle = (title || "document").replace(/[^\w\-]+/g, "_");
  const r = await fetch(`/api/export/${kind}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content, title: safeTitle }),
  });
  const blob = await r.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${safeTitle}.${kind}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  toast(`Export ${kind.toUpperCase()} prêt.`, "success");
}

async function exportFile(kind) {
  const content = $("preview-editor").value || "";
  if (!content.trim()) return;
  await exportContent(kind, content, $("title-input").value || "document");
}

function bindKeyboardShortcuts(e) {
  const isStudio = document.querySelector(".page.active")?.id === "studio";
  if (!isStudio) return;
  if (e.ctrlKey && e.key === "Enter") {
    e.preventDefault();
    generateDoc();
  }
  if (e.ctrlKey && (e.key === "s" || e.key === "S")) {
    e.preventDefault();
    saveEditedAsArchive();
  }
}

function showRenderMode() {
  $("preview-rendered").classList.remove("hidden-block");
  $("preview-editor").classList.add("hidden-block");
}

function showEditMode() {
  $("preview-editor").classList.remove("hidden-block");
  $("preview-rendered").classList.add("hidden-block");
}

function bindEvents() {
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => switchPage(btn.dataset.page));
  });
  $("upload-btn").addEventListener("click", uploadFiles);
  $("agent-select").addEventListener("change", refreshDocTypes);
  $("generate-btn").addEventListener("click", generateDoc);
  $("create-agent-btn").addEventListener("click", createAgent);
  $("archive-refresh-btn").addEventListener("click", loadArchives);
  $("archive-status-filter").addEventListener("change", loadArchives);
  $("archive-search").addEventListener("input", runSearch);
  $("save-config-btn").addEventListener("click", saveConfig);
  $("save-edited-archive-btn").addEventListener("click", saveEditedAsArchive);
  $("download-pdf-btn").addEventListener("click", () => exportFile("pdf"));
  $("download-docx-btn").addEventListener("click", () => exportFile("docx"));
  $("preview-editor").addEventListener("input", refreshEditorMetrics);
  $("preview-editor").addEventListener("input", updatePreviewRender);
  $("preview-editor").addEventListener("blur", saveDraftToHistory);
  $("preview-render-btn").addEventListener("click", showRenderMode);
  $("preview-edit-btn").addEventListener("click", showEditMode);
  $("draft-restore-btn").addEventListener("click", restoreDraftFromHistory);
  $("theme-toggle-btn").addEventListener("click", toggleTheme);
  $("sidebar-toggle-btn").addEventListener("click", toggleSidebar);
  $("archive-detail-close").addEventListener("click", closeArchiveDetail);
  $("toggle-agent-form-btn").addEventListener("click", () => toggleNewAgentModal());
  $("close-agent-modal-btn").addEventListener("click", () => toggleNewAgentModal(false));
  $("archive-detail-export-pdf").addEventListener("click", async () => {
    if (!state.archiveDetail) return;
    await exportContent("pdf", state.archiveDetail.contenu_md || "", state.archiveDetail.titre || "archive");
  });
  $("archive-detail-export-docx").addEventListener("click", async () => {
    if (!state.archiveDetail) return;
    await exportContent("docx", state.archiveDetail.contenu_md || "", state.archiveDetail.titre || "archive");
  });
  $("archive-detail-modal").addEventListener("click", (e) => {
    if (e.target.id === "archive-detail-modal") closeArchiveDetail();
  });
  $("new-agent-modal").addEventListener("click", (e) => {
    if (e.target.id === "new-agent-modal") toggleNewAgentModal(false);
  });
  document.addEventListener("keydown", bindKeyboardShortcuts);
}

async function init() {
  setTheme(localStorage.getItem("oai_doc_theme") || "dark");
  setSidebarCollapsed(localStorage.getItem("oai_doc_sidebar_collapsed") === "1");
  bindEvents();
  renderSteps("ingestion-steps", ["Préparation", "Extraction", "Indexation"], -1, -1);
  renderSteps("generation-steps", ["Contexte", "Rédaction", "Finalisation"], -1, -1);
  await Promise.all([loadStats(), loadDocuments(), loadStudioData(), loadArchives(), loadConfig()]);
  refreshEditorMetrics();
  updatePreviewRender();
  refreshDraftHistory();
  showRenderMode();
  toggleNewAgentModal(false);
}

init().catch((e) => {
  console.error(e);
  toast("Erreur de chargement UI: " + e.message, "error");
});
