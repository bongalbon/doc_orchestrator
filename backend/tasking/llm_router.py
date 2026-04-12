import os

from litellm import completion


def _default_model_for_provider(provider: str) -> str:
    defaults = {
        "ollama": os.getenv("OLLAMA_MODEL", "ollama/llama3.3:latest"),
        "openai": os.getenv("OPENAI_MODEL", "openai/gpt-4o"),
        "gemini": os.getenv("GEMINI_MODEL", "gemini/gemini-2.0-flash"),
        "grok": os.getenv("GROK_MODEL", "xai/grok-2-latest"),
        "anthropic": os.getenv("ANTHROPIC_MODEL", "anthropic/claude-3-7-sonnet-20250219"),
    }
    return defaults.get(provider, os.getenv("DEFAULT_MODEL", "openai/gpt-4o-mini"))


def resolve_model(provider: str | None, model: str | None) -> str:
    selected_provider = (provider or os.getenv("DEFAULT_PROVIDER", "ollama")).strip().lower()
    
    final_model = model.strip() if model and model.strip() else _default_model_for_provider(selected_provider)
    
    # Prefix mapping for litellm
    prefix_map = {
        "ollama": "ollama/",
        "openai": "openai/",
        "gemini": "gemini/",
        "grok": "xai/",
        "anthropic": "anthropic/",
    }
    
    prefix = prefix_map.get(selected_provider, "")
    # Add prefix if missing
    if prefix and "/" not in final_model:
        final_model = f"{prefix}{final_model}"
    
    return final_model


def run_llm_task(*, prompt: str, system_prompt: str, provider: str | None, model: str | None, api_key: str | None = None, base_url: str | None = None) -> str:
    final_model = resolve_model(provider=provider, model=model)
    
    kwargs = {
        "model": final_model,
        "messages": [
            {"role": "system", "content": system_prompt or "You are a helpful specialist assistant."},
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.2,
        "timeout": 90,
    }
    
    if api_key:
        kwargs["api_key"] = api_key
    if base_url:
        kwargs["api_base"] = base_url # LiteLLM uses api_base
        
    response = completion(**kwargs)
    return response["choices"][0]["message"]["content"]
