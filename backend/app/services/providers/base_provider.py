from abc import ABC, abstractmethod
from typing import Dict, Any, Optional, List
from app.schemas.ai_schemas import ProviderStatus


class BaseAIProvider(ABC):
    """Abstract Base Class for TrustPay AI Model Providers."""

    def __init__(self, key: str, name: str, default_model: str, role: str, privacy_compliant: bool = False):
        self.key = key
        self.name = name
        self.default_model = default_model
        self.role = role
        self.privacy_compliant = privacy_compliant

    @abstractmethod
    def is_available(self) -> bool:
        """Checks if the provider is currently active/reachable."""
        pass

    @abstractmethod
    def generate_json(self, prompt: str, system_instruction: str) -> Optional[Dict[str, Any]]:
        """Sends a prompt expecting a structured JSON response."""
        pass

    def generate_multimodal_json(self, contents: List[Any], system_instruction: str) -> Optional[Dict[str, Any]]:
        """Sends multimodal content (video/image/audio). Default returns None if unsupported."""
        return None

    def get_status(self) -> ProviderStatus:
        """Returns structured status for health dashboard."""
        return ProviderStatus(
            name=self.name,
            key=self.key,
            is_available=self.is_available(),
            model=self.default_model,
            role=self.role,
            privacy_compliant=self.privacy_compliant,
            details=f"Active model: {self.default_model}",
        )
