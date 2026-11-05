import logging
from typing import Dict, List, Optional, Tuple, Any

from app.services.providers.base_provider import BaseAIProvider
from app.services.providers.gemini_provider import GeminiProvider
from app.services.providers.ollama_provider import OllamaProvider
from app.services.providers.grok_provider import GrokProvider
from app.schemas.ai_schemas import ProviderStatus

logger = logging.getLogger("trustpay.model_router")


class ModelRouter:
    """
    Intelligent Model Router for TrustPay AI.
    Routes tasks across Gemini (Multimodal), Ollama (Local Privacy), and Grok (Arbitration)
    with automatic failover and enterprise privacy compliance.
    """

    def __init__(self):
        self.gemini = GeminiProvider()
        self.ollama = OllamaProvider()
        self.grok = GrokProvider()

        self.providers: Dict[str, BaseAIProvider] = {
            "gemini": self.gemini,
            "ollama": self.ollama,
            "grok": self.grok,
        }

    def get_all_statuses(self) -> List[ProviderStatus]:
        return [p.get_status() for p in self.providers.values()]

    def select_provider(
        self,
        requested_provider: Optional[str] = "auto",
        task_type: str = "general",
        privacy_mode: bool = False,
        requires_multimodal: bool = False,
    ) -> Tuple[Optional[BaseAIProvider], str, str]:
        """
        Selects the best provider based on constraints and availability.
        Returns: (provider_instance_or_none, provider_display_name, model_display_name)
        """
        requested = (requested_provider or "auto").lower()

        # Rule 1: Multimodal (Video/Audio/Frames) strictly requires Gemini
        if requires_multimodal:
            if self.gemini.is_available():
                return self.gemini, "Google Gemini (Multimodal)", self.gemini.default_model
            return None, "Deterministic Sandbox Engine (Multimodal Sim)", "mock-multimodal-v1"

        # Rule 2: Privacy Mode strictly routes to Local Ollama
        if privacy_mode or requested == "ollama":
            if self.ollama.is_available():
                return self.ollama, "Ollama (Local / On-Prem)", f"{self.ollama.default_model} [Privacy Mode]"
            logger.info("Ollama requested or privacy_mode active, but Ollama daemon is offline. Failing over.")
            # If privacy mode was explicitly demanded and Ollama is down, fallback to sandbox
            if privacy_mode:
                return None, "Deterministic Sandbox Engine (Local Privacy)", "mock-privacy-v1"

        # Rule 3: Explicit provider request
        if requested in self.providers:
            prov = self.providers[requested]
            if prov.is_available():
                return prov, prov.name, prov.default_model
            logger.info(f"Requested provider '{requested}' is unavailable. Engaging autonomous failover.")

        # Rule 4: Task-based routing when requested == 'auto'
        if task_type == "dispute" and self.grok.is_available():
            return self.grok, self.grok.name, self.grok.default_model
        if task_type == "code" and self.ollama.is_available():
            return self.ollama, self.ollama.name, self.ollama.default_model

        # Rule 5: Default priority chain
        for key in ["gemini", "grok", "ollama"]:
            cand = self.providers[key]
            if cand.is_available():
                return cand, cand.name, cand.default_model

        # Rule 6: Deterministic sandbox simulation fallback
        return None, "Deterministic Sandbox Engine", "mock-sandbox-v1"
