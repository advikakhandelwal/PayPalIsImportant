import os
import json
import logging
import requests
from typing import Dict, Any, Optional

from app.services.providers.base_provider import BaseAIProvider

logger = logging.getLogger("trustpay.providers.ollama")


class OllamaProvider(BaseAIProvider):
    """
    Local Ollama Provider.
    Enables 100% on-premises, NDA-compliant code security scanning
    and deliverable evaluation with ZERO cloud data transfer.
    """

    def __init__(self, base_url: Optional[str] = None, model_name: Optional[str] = None):
        key = "ollama"
        name = "Ollama (Local / On-Premises)"
        model = model_name or os.getenv("OLLAMA_MODEL", "llama3")
        role = "Enterprise Code Security & NDA Privacy (100% Local / On-Prem)"
        super().__init__(key=key, name=name, default_model=model, role=role, privacy_compliant=True)

        self.base_url = (base_url or os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")).rstrip("/")

    def is_available(self) -> bool:
        """Pings local Ollama daemon with a fast 1.5s timeout."""
        try:
            res = requests.get(f"{self.base_url}/api/tags", timeout=1.5)
            return res.status_code == 200
        except Exception:
            return False

    def generate_json(self, prompt: str, system_instruction: str) -> Optional[Dict[str, Any]]:
        """
        Executes query against Ollama's local JSON generation endpoint.
        """
        if not self.is_available():
            return None

        try:
            full_prompt = f"{system_instruction}\n\nTask:\n{prompt}\n\nRespond ONLY with valid JSON."
            payload = {
                "model": self.default_model,
                "prompt": full_prompt,
                "format": "json",
                "stream": False,
                "options": {
                    "temperature": 0.2,
                },
            }
            res = requests.post(f"{self.base_url}/api/generate", json=payload, timeout=30.0)
            if res.status_code == 200:
                body = res.json()
                raw_response = body.get("response", "")
                return json.loads(raw_response)
            else:
                logger.warning(f"Ollama returned HTTP {res.status_code}: {res.text}")
        except Exception as e:
            logger.error(f"Ollama generation failed: {e}")
            return None
        return None
