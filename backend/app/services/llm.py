import json
import httpx
from typing import AsyncIterator
from app.core.config import settings

class LLMService:
    def __init__(self):
        self.api_key = settings.LLM_API_KEY
        self.base_url = settings.LLM_BASE_URL.rstrip("/")
        self.model = settings.LLM_MODEL

    async def chat_stream(self, system_prompt: str, user_prompt: str) -> AsyncIterator[str]:
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            "stream": True
        }

        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                async with client.stream(
                    "POST",
                    f"{self.base_url}/chat/completions",
                    headers=headers,
                    json=payload
                ) as response:
                    response.raise_for_status()
                    async for line in response.aiter_lines():
                        if line:
                            if line.startswith("data: "):
                                yield line + "\n\n"
                            elif line.strip() == "data: [DONE]":
                                yield "data: [DONE]\n\n"
        except httpx.HTTPStatusError as e:
            yield "data: " + json.dumps({"error": f"LLM HTTP error: {e.response.status_code}"}) + "\n\n"
        except httpx.RequestError as e:
            yield "data: " + json.dumps({"error": f"LLM request error: {str(e)}"}) + "\n\n"
        except Exception as e:
            yield "data: " + json.dumps({"error": f"LLM unexpected error: {str(e)}"}) + "\n\n"
