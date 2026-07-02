import asyncio
import json
import httpx
from typing import AsyncIterator
from app.services.config_service import config_service

import logging
logger = logging.getLogger("llm")


class LLMService:
    def __init__(self):
        self.max_retries = 3

    def _load_config(self):
        return {
            "api_key": config_service.get("llm_api_key", ""),
            "base_url": config_service.get("llm_base_url", "https://api.moonshot.cn/v1").rstrip("/"),
            "model": config_service.get("llm_model", "moonshot-v1-8k"),
        }

    async def chat_stream(self, system_prompt: str, user_prompt: str) -> AsyncIterator[str]:
        cfg = self._load_config()
        headers = {
            "Authorization": f"Bearer {cfg['api_key']}",
            "Content-Type": "application/json"
        }
        payload = {
            "model": cfg["model"],
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            "stream": True
        }

        client = httpx.AsyncClient(timeout=60.0)
        try:
            for attempt in range(self.max_retries):
                response = await client.send(
                    client.build_request("POST", f"{cfg['base_url']}/chat/completions", headers=headers, json=payload),
                    stream=True,
                )
                if response.status_code == 429:
                    wait = 2 ** attempt
                    logger.warning(f"Kimi 429 rate limit, retry in {wait}s (attempt {attempt + 1}/{self.max_retries})")
                    await response.aclose()
                    await asyncio.sleep(wait)
                    continue
                response.raise_for_status()
                break
            else:
                yield "data: " + json.dumps({"error": "LLM 请求过于频繁，请稍后重试"}) + "\n\n"
                return

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
        finally:
            await client.aclose()
