import asyncio
import json
import httpx
from typing import AsyncIterator
from app.core.config import settings

import logging
logger = logging.getLogger("llm")


class LLMService:
    def __init__(self):
        self.api_key = settings.LLM_API_KEY
        self.base_url = settings.LLM_BASE_URL.rstrip("/")
        self.model = settings.LLM_MODEL
        self.max_retries = 3

    async def _stream_request(self, headers, payload) -> httpx.Response:
        """发起流式请求，429 时自动重试（指数退避）。"""
        last_error = None
        for attempt in range(self.max_retries):
            try:
                async with httpx.AsyncClient(timeout=60.0) as client:
                    async with client.stream(
                        "POST",
                        f"{self.base_url}/chat/completions",
                        headers=headers,
                        json=payload
                    ) as response:
                        if response.status_code == 429:
                            last_error = response
                            wait = 2 ** attempt
                            logger.warning(f"Kimi 429 rate limit, retry in {wait}s (attempt {attempt + 1}/{self.max_retries})")
                            await asyncio.sleep(wait)
                            continue
                        response.raise_for_status()
                        return response
            except httpx.HTTPStatusError as e:
                if e.response.status_code == 429:
                    last_error = e.response
                    wait = 2 ** attempt
                    logger.warning(f"Kimi 429 rate limit, retry in {wait}s (attempt {attempt + 1}/{self.max_retries})")
                    await asyncio.sleep(wait)
                    continue
                raise
        raise httpx.HTTPStatusError(
            "429 rate limited after retries",
            request=last_error.request if last_error else None,
            response=last_error
        ) if hasattr(last_error, 'request') else Exception("429 rate limited after retries")

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
            response = await self._stream_request(headers, payload)
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
