from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    supabase_url: str = ""
    supabase_service_role_key: str = ""
    model_path: str = "model/agribot_tomato_v1.onnx"
    model_version: str = "tomato-tm-v1"
    low_confidence: float = 0.6
    min_leaf_fraction: float = 0.10
    max_upload_bytes: int = 2 * 1024 * 1024
    min_side: int = 96

    @classmethod
    def from_env(cls) -> Settings:
        env = os.environ
        return cls(
            supabase_url=env.get("SUPABASE_URL", ""),
            supabase_service_role_key=env.get("SUPABASE_SERVICE_ROLE_KEY", ""),
            model_path=env.get("MODEL_PATH", cls.model_path),
            model_version=env.get("MODEL_VERSION", cls.model_version),
            low_confidence=float(env.get("LOW_CONFIDENCE_THRESHOLD", cls.low_confidence)),
            min_leaf_fraction=float(env.get("MIN_LEAF_FRACTION", cls.min_leaf_fraction)),
        )
