from pathlib import Path
from typing import Any

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import HTMLResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.requests import Request

from config import get_config, save_config, UPLOADS_DIR
from database import (
    get_all_documents,
    get_all_archives,
    get_stats,
    add_document,
    delete_document,
    delete_archive,
    validate_archive,
    add_archive,
    semantic_search,
    index_document_chunks,
    split_text_into_chunks,
)
from doc_processor import process_document, get_file_size_kb, SUPPORTED_EXTENSIONS
from llm_handler import (
    LLMHandler,
    get_available_llm_models,
    check_ollama_status,
    save_agents,
    load_agents,
)
from doc_generator import generate_pdf, generate_docx


BASE_DIR = Path(__file__).parent.resolve()
WEB_DIR = BASE_DIR / "web"
TEMPLATES_DIR = WEB_DIR / "templates"
STATIC_DIR = WEB_DIR / "static"

TEMPLATES_DIR.mkdir(parents=True, exist_ok=True)
STATIC_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="AI-Doc-Orchestrator API")
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")
templates = Jinja2Templates(directory=str(TEMPLATES_DIR))
llm = LLMHandler()


@app.get("/", response_class=HTMLResponse)
def home(request: Request):
    return templates.TemplateResponse(request=request, name="index.html", context={})


@app.get("/api/health")
def api_health():
    ollama_ok, _ = check_ollama_status()
    return {"ok": True, "ollama_ok": ollama_ok}


@app.get("/api/stats")
def api_stats():
    cfg = get_config()
    ollama_ok, _ = check_ollama_status()
    return {
        "stats": get_stats(),
        "services": {
            "ollama": ollama_ok,
            "gemini": bool(cfg.get("GEMINI_API_KEY")),
            "openai": bool(cfg.get("OPENAI_API_KEY")),
        },
        "recent_archives": get_all_archives()[:5],
    }


@app.get("/api/documents")
def api_documents():
    return {"documents": get_all_documents()}


@app.post("/api/upload")
async def api_upload(files: list[UploadFile] = File(...)):
    results: list[dict[str, Any]] = []
    ok = 0
    ko = 0

    for f in files:
        ext = Path(f.filename).suffix.lower().lstrip(".")
        if ext not in SUPPORTED_EXTENSIONS:
            results.append({"file": f.filename, "ok": False, "error": "Extension non supportée"})
            ko += 1
            continue
        try:
            target = UPLOADS_DIR / f.filename
            content = await f.read()
            target.write_bytes(content)
            processed = process_document(str(target), ext, llm)
            if not processed.get("ok"):
                results.append({"file": f.filename, "ok": False, "error": processed.get("error", "Extraction impossible")})
                ko += 1
                continue

            doc_id = add_document(
                f.filename,
                ext,
                str(target),
                processed["text"][:200],
                processed.get("nb_pages", 0),
                processed.get("langue", "fr"),
                [],
                get_file_size_kb(str(target)),
            )
            index_document_chunks(doc_id, f.filename, split_text_into_chunks(processed["text"], 800))
            results.append({"file": f.filename, "ok": True, "doc_id": doc_id})
            ok += 1
        except Exception as e:
            results.append({"file": f.filename, "ok": False, "error": str(e)})
            ko += 1

    return {"ok": ok, "ko": ko, "results": results}


@app.delete("/api/documents/{doc_id}")
def api_delete_document(doc_id: str):
    delete_document(doc_id)
    return {"ok": True}


@app.get("/api/models")
def api_models():
    return {"models": get_available_llm_models()}


@app.get("/api/agents")
def api_agents():
    return {"agents": load_agents()}


@app.post("/api/agents")
def api_create_agent(payload: dict):
    agents = load_agents()
    name = (payload.get("name") or "").strip()
    icon = (payload.get("icon") or "🧠").strip() or "🧠"
    description = (payload.get("description") or "").strip() or "Agent personnalisé"
    system_prompt = (payload.get("system_prompt") or "").strip()
    doc_types = payload.get("doc_types") or []
    if isinstance(doc_types, str):
        doc_types = [x.strip() for x in doc_types.split(",") if x.strip()]

    if not name:
        raise HTTPException(status_code=400, detail="Nom d'agent obligatoire")
    if name in agents:
        raise HTTPException(status_code=400, detail="Agent déjà existant")
    if not system_prompt:
        raise HTTPException(status_code=400, detail="System prompt obligatoire")
    if not doc_types:
        doc_types = ["Document"]

    agents[name] = {
        "icon": icon,
        "description": description,
        "system_prompt": system_prompt,
        "doc_types": doc_types,
    }
    save_agents(agents)
    return {"ok": True, "agents": agents}


@app.post("/api/generate")
def api_generate(payload: dict):
    user_request = (payload.get("objective") or "").strip()
    if not user_request:
        raise HTTPException(status_code=400, detail="Objectif obligatoire")

    agent = payload.get("agent")
    model_label = payload.get("model_label")
    doc_type = payload.get("doc_type") or "Document"
    title = (payload.get("title") or "Note").strip()
    custom_instructions = payload.get("custom_instructions", "")
    use_rag = bool(payload.get("use_rag", True))
    rag_k = int(payload.get("rag_k", 5))

    models = get_available_llm_models()
    if model_label not in models or not models[model_label]:
        raise HTTPException(status_code=400, detail="Modèle invalide")
    model_id = models[model_label]

    context_chunks = semantic_search(user_request, n_results=max(1, min(rag_k, 10))) if use_rag else []
    text = llm.generate_with_rag(
        user_request=user_request,
        agent_name=agent,
        model=model_id,
        doc_type=doc_type,
        context_chunks=context_chunks,
        custom_instructions=custom_instructions,
    )

    archive_id = add_archive(doc_type, title, text, agent, model_label)
    return {"ok": True, "archive_id": archive_id, "content": text, "title": title}


@app.get("/api/archives")
def api_archives(status: str | None = None):
    if status == "all":
        status = None
    return {"archives": get_all_archives(statut=status)}


@app.post("/api/archives/{archive_id}/validate")
def api_validate_archive(archive_id: str):
    validate_archive(archive_id)
    return {"ok": True}


@app.post("/api/archives")
def api_add_archive(payload: dict):
    arch_id = add_archive(
        payload.get("doc_type", "Document"),
        payload.get("title", "Note"),
        payload.get("content", ""),
        payload.get("agent", ""),
        payload.get("model_label", ""),
    )
    return {"ok": True, "archive_id": arch_id}


@app.delete("/api/archives/{archive_id}")
def api_delete_archive(archive_id: str):
    delete_archive(archive_id)
    return {"ok": True}


@app.post("/api/export/pdf")
def api_export_pdf(payload: dict):
    content = payload.get("content", "")
    title = payload.get("title", "document")
    pdf_bytes = generate_pdf(content, title=title)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{title}.pdf"'},
    )


@app.post("/api/export/docx")
def api_export_docx(payload: dict):
    content = payload.get("content", "")
    title = payload.get("title", "document")
    docx_bytes = generate_docx(content, title=title)
    return Response(
        content=docx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="{title}.docx"'},
    )


@app.get("/api/search")
def api_search(q: str, n: int = 3):
    if not q.strip():
        return {"results": []}
    return {"results": semantic_search(q, n_results=max(1, min(n, 10)))}


@app.get("/api/config")
def api_get_config():
    cfg = get_config()
    return {
        "GEMINI_API_KEY": cfg.get("GEMINI_API_KEY", ""),
        "OPENAI_API_KEY": cfg.get("OPENAI_API_KEY", ""),
        "OLLAMA_BASE_URL": cfg.get("OLLAMA_BASE_URL", "http://localhost:11434"),
        "CUSTOM_MODEL": cfg.get("CUSTOM_MODEL", ""),
        "EMBED_MODEL": cfg.get("EMBED_MODEL", "all-MiniLM-L6-v2"),
    }


@app.post("/api/config")
def api_save_config(payload: dict):
    save_config(
        {
            "GEMINI_API_KEY": payload.get("GEMINI_API_KEY", ""),
            "OPENAI_API_KEY": payload.get("OPENAI_API_KEY", ""),
            "OLLAMA_BASE_URL": payload.get("OLLAMA_BASE_URL", "http://localhost:11434"),
            "CUSTOM_MODEL": payload.get("CUSTOM_MODEL", ""),
            "EMBED_MODEL": payload.get("EMBED_MODEL", "all-MiniLM-L6-v2"),
        }
    )
    llm.reload_keys()
    return JSONResponse({"ok": True})
