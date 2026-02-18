import json
import urllib.request
from dataclasses import dataclass
from typing import Any, Dict

@dataclass
class OllamaClient:
    base_url: str = "http://127.0.0.1:11434"

    def generate(
        self,
        *,
        model: str,
        prompt: str,
        temperature: float = 0.2,
        timeout_s: int = 180,
    ) -> str:
        url = f"{self.base_url}/api/generate"
        payload: Dict[str, Any] = {
            "model": model,
            "prompt": prompt,
            "stream": False,
            "options": {"temperature": temperature},
        }

        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )

        with urllib.request.urlopen(req, timeout=timeout_s) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            return (data.get("response") or "").strip()
