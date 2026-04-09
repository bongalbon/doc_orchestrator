import os

from litellm import completion


def _default_model_for_provider(provider: str) -> str:
    defaults = {
        "ollama": os.getenv("OLLAMA_MODEL", "ollama/llama3.1:8b"),
        "openai": os.getenv("OPENAI_MODEL", "openai/gpt-4o-mini"),
        "gemini": os.getenv("GEMINI_MODEL", "gemini/gemini-1.5-flash"),
        "grok": os.getenv("GROK_MODEL", "xai/grok-2-latest"),
        "anthropic": os.getenv("ANTHROPIC_MODEL", "anthropic/claude-3-5-sonnet-20240620"),
    }
    return defaults.get(provider, os.getenv("DEFAULT_MODEL", "openai/gpt-4o-mini"))


def resolve_model(provider: str | None, model: str | None) -> str:
    selected_provider = (provider or os.getenv("DEFAULT_PROVIDER", "ollama")).strip().lower()
    if model and model.strip():
        return model.strip()
    return _default_model_for_provider(selected_provider)


def run_llm_task(*, prompt: str, system_prompt: str, provider: str | None, model: str | None) -> str:
    final_model = resolve_model(provider=provider, model=model)
    response = completion(
        model=final_model,
        messages=[
            {"role": "system", "content": system_prompt or "You are a helpful specialist assistant."},
            {"role": "user", "content": prompt},
        ],
        temperature=0.2,
        timeout=90,
    )
    return response["choices"][0]["message"]["content"]
