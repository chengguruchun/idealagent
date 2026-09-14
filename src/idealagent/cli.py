from __future__ import annotations

import argparse
import sys
from pathlib import Path

from idealagent.agent import Agent
from idealagent.config import load_settings
from idealagent.llm import LLMClient
from idealagent.tools import builtin_tools


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(prog="idealagent", description="第一个 Python Agent")
    parser.add_argument("prompt", nargs="?", help="一次性提问；省略则进入对话")
    parser.add_argument("-q", "--quiet", action="store_true", help="不打印工具调用轨迹")
    args = parser.parse_args(argv)

    try:
        settings = load_settings()
    except (RuntimeError, ValueError) as exc:
        print(exc, file=sys.stderr)
        sys.exit(1)

    agent = Agent(
        llm=LLMClient(settings),
        tools=builtin_tools(Path.cwd()),
    )
    on_tool = None if args.quiet else _print_tool

    if args.prompt:
        print(agent.run(args.prompt, on_tool=on_tool))
        return

    _repl(agent, settings.label, on_tool)


def _repl(agent: Agent, label: str, on_tool) -> None:
    print(f"IdealAgent  ·  {label}")
    print("输入问题开始对话。/tools 查看工具，/reset 清空上下文，/quit 退出。")
    print()

    while True:
        try:
            text = input("You › ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            return
        if not text:
            continue
        if text in {"/quit", "/exit", "/q"}:
            return
        if text == "/reset":
            agent.reset()
            print("已清空对话。")
            continue
        if text == "/tools":
            print("工具: " + ", ".join(agent.tools.names()))
            continue

        try:
            reply = agent.run(text, on_tool=on_tool)
        except Exception as exc:
            print(f"调用失败: {exc}", file=sys.stderr)
            continue
        print(f"Agent › {reply}\n")


def _print_tool(name: str, arguments: str, result: str) -> None:
    preview = result if len(result) <= 200 else result[:200] + "..."
    print(f"  ⚙ {name}({arguments})")
    print(f"  → {preview}")


if __name__ == "__main__":
    main()
