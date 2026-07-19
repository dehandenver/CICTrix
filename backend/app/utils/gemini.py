"""
Gemini via the REST API (httpx) instead of the google-generativeai SDK.

The SDK pulls in grpcio + protobuf + google-api-core + google-auth. Swapping
anthropic for it pushed the Vercel Python serverless function past its 250 MB
size limit, so the deploy that added `google-generativeai` failed to build
(1f3802a deployed fine on anthropic; 317ddc2 broke on the swap). httpx is
already a dependency and calls the same Generative Language endpoint with none
of that weight.

Returns an object exposing `.text`, so callers' existing
`json.loads(response.text)` extraction keeps working unchanged.
"""

from __future__ import annotations

from typing import Optional

import httpx

_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"


class GeminiResponse:
    """Minimal stand-in for the SDK response — just the `.text` callers read."""

    def __init__(self, text: str):
        self.text = text


def generate_content(
    *,
    api_key: str,
    model: str,
    system_instruction: str,
    user_message: str,
    response_schema: Optional[dict] = None,
    temperature: float = 0.2,
    timeout: float = 60.0,
) -> GeminiResponse:
    """Call Gemini generateContent and return the model's text.

    Mirrors the previous SDK usage: a system instruction, one user message, and
    JSON output constrained by `response_schema` when supplied.
    """
    generation_config: dict = {
        "responseMimeType": "application/json",
        "temperature": temperature,
    }
    if response_schema is not None:
        generation_config["responseSchema"] = response_schema

    body = {
        "systemInstruction": {"parts": [{"text": system_instruction}]},
        "contents": [{"role": "user", "parts": [{"text": user_message}]}],
        "generationConfig": generation_config,
    }

    url = _ENDPOINT.format(model=model)
    response = httpx.post(url, params={"key": api_key}, json=body, timeout=timeout)
    response.raise_for_status()
    data = response.json()

    try:
        text = data["candidates"][0]["content"]["parts"][0]["text"]
    except (KeyError, IndexError) as exc:
        # A blocked or empty response — surface the payload so the caller's 502
        # carries something diagnosable rather than a bare KeyError.
        raise ValueError(f"Gemini returned no text content: {data}") from exc

    return GeminiResponse(text)
