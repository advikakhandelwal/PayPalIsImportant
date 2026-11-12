import os
import json
import logging
from typing import Dict, Any, Optional, List
from google import genai
from google.genai import types

from app.services.providers.base_provider import BaseAIProvider

logger = logging.getLogger("trustpay.providers.gemini")


class GeminiProvider(BaseAIProvider):
    """Google Gemini AI Provider using the official google-genai SDK."""

    def __init__(self, api_key: Optional[str] = None, model_name: Optional[str] = None):
        key = "gemini"
        name = "Google Gemini"
        model = model_name or os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
        role = "Multimodal Vision, Audio & Spec Decomposition (Primary Cloud Engine)"
        super().__init__(key=key, name=name, default_model=model, role=role, privacy_compliant=False)

        self.api_key = api_key or os.getenv("GEMINI_API_KEY")
        self.client: Optional[genai.Client] = None
        if self.api_key:
            try:
                self.client = genai.Client(
                    api_key=self.api_key,
                    http_options=types.HttpOptions(api_version="v1beta"),
                )
                logger.info(f"Gemini client initialized with model '{self.default_model}'")
            except Exception as e:
                logger.warning(f"Failed to initialize Gemini client: {e}")

    def is_available(self) -> bool:
        return self.client is not None and bool(self.api_key)

    def generate_json(self, prompt: str, system_instruction: str) -> Optional[Dict[str, Any]]:
        return self.generate_multimodal_json(contents=[prompt], system_instruction=system_instruction)

    def generate_multimodal_json(self, contents: List[Any], system_instruction: str) -> Optional[Dict[str, Any]]:
        if not self.is_available():
            return None

        try:
            config = types.GenerateContentConfig(
                system_instruction=system_instruction,
                response_mime_type="application/json",
                temperature=0.2,
            )
            response = self.client.models.generate_content(
                model=self.default_model,
                contents=contents,
                config=config,
            )
            if response and response.text:
                return json.loads(response.text)
        except Exception as e:
            logger.error(f"Gemini generation error: {e}")
            return None
        return None
