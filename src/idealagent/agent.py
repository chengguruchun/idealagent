from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable

from idealagent.llm import LLMClient, LLMResponse
from idealagent.tools import ToolRegistry

SYSTEM_PROMPT = """你是 IdealAgent，一个通过工具完成任务的助手。

规则：
- 需要精确计算、当前时间或读取本地文件时，必须调用工具，不要猜测。
- 可以连续调用多个工具，直到能给出可靠答案。
- 工具返回后，用简洁的中文回答用户。
- 工具失败时，说明原因，不要编造结果。
"""

OnTool = Callable[[str, str, str], None]


@dataclass
class Agent:
    """The first agent: model decides → tools run → model answers."""

    llm: LLMClient
    tools: ToolRegistry
    system_prompt: str = SYSTEM_PROMPT
    max_steps: int = 8
    history: list[dict[str, Any]] = field(default_factory=list)

    def __post_init__(self) -> None:
        if not self.history:
            self.history.append({"role": "system", "content": self.system_prompt})

    def reset(self) -> None:
        self.history = [{"role": "system", "content": self.system_prompt}]

    def run(self, user_message: str, on_tool: OnTool | None = None) -> str:
        self.history.append({"role": "user", "content": user_message})

        for _ in range(self.max_steps):
            response = self.llm.chat(self.history, tools=self.tools.schemas())
            if response.tool_calls:
                self._apply_tools(response, on_tool)
                continue
            reply = response.content or ""
            self.history.append({"role": "assistant", "content": reply})
            return reply

        fallback = f"超过最大步数 {self.max_steps}，停止。"
        self.history.append({"role": "assistant", "content": fallback})
        return fallback

    def _apply_tools(self, response: LLMResponse, on_tool: OnTool | None) -> None:
        self.history.append(
            {
                "role": "assistant",
                "content": response.content,
                "tool_calls": [
                    {
                        "id": call.id,
                        "type": "function",
                        "function": {
                            "name": call.name,
                            "arguments": call.arguments,
                        },
                    }
                    for call in response.tool_calls
                ],
            }
        )
        for call in response.tool_calls:
            result = self.tools.execute(call.name, call.arguments)
            if on_tool:
                on_tool(call.name, call.arguments, result)
            self.history.append(
                {
                    "role": "tool",
                    "tool_call_id": call.id,
                    "content": result,
                }
            )
