# IdealAgent

第一个 Python Agent：模型决定是否调用工具，工具执行后再由模型回答。

```
用户 → Agent.run()
         ├─ LLM.chat(messages, tools)
         ├─ 若返回 tool_calls → 执行工具，把结果写回 messages
         └─ 否则输出最终回答
```

内置工具：`calculator`、`now`、`list_dir`、`read_file`。

## 准备

需要一个兼容 OpenAI Chat Completions 的 API Key。任选其一写入 `.env`：

```bash
cp .env.example .env
```

```
DASHSCOPE_API_KEY=sk-...     # 百炼，默认 qwen-plus
# 或
DEEPSEEK_API_KEY=sk-...      # DeepSeek，默认 deepseek-chat
# 或
OPENAI_API_KEY=sk-...        # OpenAI，默认 gpt-4o-mini
```

## 运行

```bash
uv sync
uv run idealagent "现在几点？再帮我算 123 * 456 + 789"
uv run idealagent
```

对话里可以用 `/tools`、`/reset`、`/quit`。
