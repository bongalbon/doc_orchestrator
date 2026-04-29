import os
import time
import logging

from litellm import completion
from litellm.exceptions import RateLimitError

logger = logging.getLogger(__name__)


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


def run_llm_task(*, prompt: str, system_prompt: str, provider: str | None, model: str | None, api_key: str | None = None, base_url: str | None = None, max_retries: int = 3) -> str:
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
        kwargs["api_base"] = base_url  # LiteLLM uses api_base

    # Retry loop with exponential backoff for rate limit errors
    last_exception = None
    for attempt in range(max_retries):
        try:
            response = completion(**kwargs)
            return response["choices"][0]["message"]["content"]
        except RateLimitError as e:
            last_exception = e
            # Extract retry delay from error if available, otherwise use exponential backoff
            retry_delay = 2 ** attempt  # 1s, 2s, 4s

            # Try to parse retry delay from Gemini error message
            error_str = str(e)
            if "retry in" in error_str.lower():
                try:
                    import re
                    match = re.search(r'retry in ([\d.]+)s', error_str, re.IGNORECASE)
                    if match:
                        retry_delay = float(match.group(1))
                        # Cap max delay at 60 seconds
                        retry_delay = min(retry_delay, 60)
                except (ValueError, IndexError):
                    pass

            if attempt < max_retries - 1:
                logger.warning(f"Rate limit hit (attempt {attempt + 1}/{max_retries}), retrying in {retry_delay:.1f}s...")
                time.sleep(retry_delay)
            else:
                logger.error(f"Rate limit hit, max retries ({max_retries}) exceeded")
                raise
        except Exception:
            # Re-raise non-rate-limit errors immediately
            raise

    # If we exhausted retries, raise the last exception
    if last_exception:
        raise last_exception
    raise RuntimeError("Unexpected error in retry loop")
