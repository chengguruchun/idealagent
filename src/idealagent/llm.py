from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from openai import OpenAI

from idealagent.config import Settings


@dataclass
class ToolCall:
    id: str
    name: str
    arguments: str


@dataclass
class LLMResponse:
    content: str | None
    tool_calls: list[ToolCall]


class LLMClient:
    """Thin OpenAI-compatible wrapper. The agent loop stays provider-agnostic."""

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self._client = OpenAI(
            api_key=settings.api_key,
            base_url=settings.provider.base_url,
        )

    def chat(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
    ) -> LLMResponse:
        kwargs: dict[str, Any] = {
            "model": self.settings.model,
            "messages": messages,
        }
        if tools:
            kwargs["tools"] = tools
            kwargs["tool_choice"] = "auto"

        choice = self._client.chat.completions.create(**kwargs).choices[0].message
        tool_calls = [
            ToolCall(
                id=tc.id,
                name=tc.function.name,
                arguments=tc.function.arguments or "{}",
            )
            for tc in (choice.tool_calls or [])
        ]
        return LLMResponse(content=choice.content, tool_calls=tool_calls)
