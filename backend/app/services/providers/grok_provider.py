import os
import json
import logging
import requests
from typing import Dict, Any, Optional

from app.services.providers.base_provider import BaseAIProvider

logger = logging.getLogger("trustpay.providers.grok")


class GrokProvider(BaseAIProvider):
    """
    xAI Grok Provider.
    High-speed, objective cloud reasoning for dispute arbitration
    and autonomous milestone settlement.
    """

    def __init__(self, api_key: Optional[str] = None, model_name: Optional[str] = None):
        key = "grok"
        name = "xAI Grok"
        model = model_name or os.getenv("GROK_MODEL", "grok-2")
        role = "Unbiased Dispute Arbitration & High-Speed Reasoning"
        super().__init__(key=key, name=name, default_model=model, role=role, privacy_compliant=False)

        self.api_key = api_key or os.getenv("GROK_API_KEY") or os.getenv("XAI_API_KEY")
        self.base_url = (os.getenv("GROK_BASE_URL", "https://api.x.ai/v1")).rstrip("/")

    def is_available(self) -> bool:
        return bool(self.api_key)

    def generate_json(self, prompt: str, system_instruction: str) -> Optional[Dict[str, Any]]:
        if not self.is_available():
            return None

        try:
            headers = {
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            }
            messages = [
                {"role": "system", "content": f"{system_instruction} Output strictly in JSON format."},
                {"role": "user", "content": prompt},
            ]
            payload = {
                "model": self.default_model,
                "messages": messages,
                "temperature": 0.2,
                "response_format": {"type": "json_object"},
            }
            res = requests.post(f"{self.base_url}/chat/completions", headers=headers, json=payload, timeout=25.0)
            if res.status_code == 200:
                data = res.json()
                content = data["choices"][0]["message"]["content"]
                return json.loads(content)
            else:
                logger.warning(f"Grok API error HTTP {res.status_code}: {res.text}")
        except Exception as e:
            logger.error(f"Grok generation failed: {e}")
            return None
        return None
