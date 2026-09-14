from __future__ import annotations

import ast
import json
import operator
import os
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, Callable
from zoneinfo import ZoneInfo

Handler = Callable[..., str]


@dataclass
class Tool:
    name: str
    description: str
    parameters: dict[str, Any]
    handler: Handler


@dataclass
class ToolRegistry:
    _tools: dict[str, Tool] = field(default_factory=dict)

    def register(self, tool: Tool) -> None:
        self._tools[tool.name] = tool

    def tool(
        self,
        *,
        description: str,
        parameters: dict[str, Any],
        name: str | None = None,
    ) -> Callable[[Handler], Handler]:
        def decorator(fn: Handler) -> Handler:
            self.register(
                Tool(
                    name=name or fn.__name__,
                    description=description,
                    parameters=parameters,
                    handler=fn,
                )
            )
            return fn

        return decorator

    def schemas(self) -> list[dict[str, Any]]:
        return [
            {
                "type": "function",
                "function": {
                    "name": tool.name,
                    "description": tool.description,
                    "parameters": tool.parameters,
                },
            }
            for tool in self._tools.values()
        ]

    def execute(self, name: str, arguments: str) -> str:
        tool = self._tools.get(name)
        if tool is None:
            return f"未知工具: {name}"
        try:
            payload = json.loads(arguments) if arguments else {}
            if not isinstance(payload, dict):
                return "工具参数必须是 JSON 对象"
            return tool.handler(**payload)
        except Exception as exc:
            return f"工具执行失败: {exc}"

    def names(self) -> list[str]:
        return list(self._tools)


_OPS: dict[type, Callable[[Any, Any], Any]] = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.FloorDiv: operator.floordiv,
    ast.Mod: operator.mod,
    ast.Pow: operator.pow,
}
_UNARY: dict[type, Callable[[Any], Any]] = {
    ast.UAdd: operator.pos,
    ast.USub: operator.neg,
}


def _safe_eval(node: ast.AST) -> float | int:
    if isinstance(node, ast.Expression):
        return _safe_eval(node.body)
    if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
        return node.value
    if isinstance(node, ast.UnaryOp) and type(node.op) in _UNARY:
        return _UNARY[type(node.op)](_safe_eval(node.operand))
    if isinstance(node, ast.BinOp) and type(node.op) in _OPS:
        return _OPS[type(node.op)](_safe_eval(node.left), _safe_eval(node.right))
    raise ValueError("只支持数字和 + - * / // % **")


def builtin_tools(workspace: Path | None = None) -> ToolRegistry:
    registry = ToolRegistry()
    root = (workspace or Path.cwd()).resolve()

    @registry.tool(
        description="计算数学表达式。只支持数字和 + - * / // % **。",
        parameters={
            "type": "object",
            "properties": {
                "expression": {
                    "type": "string",
                    "description": "例如 123 * 456 + 789",
                }
            },
            "required": ["expression"],
        },
    )
    def calculator(expression: str) -> str:
        tree = ast.parse(expression, mode="eval")
        return str(_safe_eval(tree))

    @registry.tool(
        description="获取当前日期和时间。",
        parameters={
            "type": "object",
            "properties": {
                "timezone": {
                    "type": "string",
                    "description": "IANA 时区，默认 Asia/Shanghai",
                }
            },
        },
    )
    def now(timezone: str = "Asia/Shanghai") -> str:
        tz = ZoneInfo(timezone)
        return datetime.now(tz).strftime("%Y-%m-%d %H:%M:%S %Z")

    @registry.tool(
        description="列出工作区内某个目录的文件。路径必须在当前工作目录内。",
        parameters={
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "相对路径，默认当前目录",
                }
            },
        },
    )
    def list_dir(path: str = ".") -> str:
        target = _safe_path(root, path)
        if not target.is_dir():
            return f"不是目录: {path}"
        names = sorted(os.listdir(target))
        return "\n".join(names) if names else "(空目录)"

    @registry.tool(
        description="读取工作区内的文本文件。路径必须在当前工作目录内。",
        parameters={
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "相对路径"},
                "max_chars": {
                    "type": "integer",
                    "description": "最多返回的字符数，默认 4000",
                },
            },
            "required": ["path"],
        },
    )
    def read_file(path: str, max_chars: int = 4000) -> str:
        target = _safe_path(root, path)
        if not target.is_file():
            return f"文件不存在: {path}"
        text = target.read_text(encoding="utf-8", errors="replace")
        if len(text) > max_chars:
            return text[:max_chars] + "\n...[truncated]"
        return text

    return registry


def _safe_path(root: Path, raw: str) -> Path:
    target = (root / raw).resolve()
    if not target.is_relative_to(root):
        raise ValueError("路径超出工作区")
    return target
