"""
TrustPay AI — ID Conversion & Resolver Utility
===============================================
Deterministically maps string IDs (and demo legacy aliases) to integer database primary keys.
Avoids fragile regex digit stripping while maintaining full compatibility with frontend contracts.
"""

from typing import Dict
from fastapi import HTTPException, status

# Explicit Demo Aliases for Frontend Mock Compatibility
DEMO_ID_ALIASES: Dict[str, Dict[str, int]] = {
    "projects": {
        "proj-101": 1,
        "proj-102": 2,
        "proj-103": 3,
        "proj-104": 4,
        "proj-105": 5,
    },
    "contracts": {
        "contract-4040": 1,
    },
    "users": {
        "client-fintech-corp": 1,
        "client-media-house": 1,
        "client-acme-ventures": 1,
        "client-quantum-pay": 1,
        "client-aether-ai": 1,
        "freelancer-vachan": 2,
        "freelancer-alex": 3,
    },
    "milestones": {
        "ms-1": 1,
        "ms-2": 2,
        "ms-3": 3,
    },
    "applications": {
        "app-1": 1,
        "app-2": 2,
    },
}


def resolve_entity_id(raw_id: str, entity_type: str) -> int:
    """
    Resolves an incoming string identifier into an integer database primary key.
    
    Rules:
    1. If pure numeric string ('1', '101'), return int(raw_id).
    2. If explicit registered alias (e.g. 'proj-101', 'contract-4040'), return mapped int.
    3. If invalid/unregistered string, raise HTTP 404 Not Found directly.
    """
    if not raw_id or not isinstance(raw_id, str):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid {entity_type} identifier: ID cannot be empty."
        )

    cleaned = raw_id.strip()

    # 1. Pure numeric check
    if cleaned.isdigit():
        return int(cleaned)

    # 2. Explicit demo alias check
    entity_aliases = DEMO_ID_ALIASES.get(entity_type.lower(), {})
    if cleaned in entity_aliases:
        return entity_aliases[cleaned]

    # 3. Not found — do NOT guess or strip random numbers
    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail=f"{entity_type.capitalize()} with identifier '{cleaned}' not found."
    )

