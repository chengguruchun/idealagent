from __future__ import annotations

import os
from dataclasses import dataclass

from dotenv import load_dotenv

load_dotenv()


@dataclass(frozen=True)
class Provider:
    name: str
    env_key: str
    base_url: str
    default_model: str


PROVIDERS: dict[str, Provider] = {
    "dashscope": Provider(
        name="dashscope",
        env_key="DASHSCOPE_API_KEY",
        base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
        default_model="qwen-plus",
    ),
    "deepseek": Provider(
        name="deepseek",
        env_key="DEEPSEEK_API_KEY",
        base_url="https://api.deepseek.com",
        default_model="deepseek-chat",
    ),
    "openai": Provider(
        name="openai",
        env_key="OPENAI_API_KEY",
        base_url="https://api.openai.com/v1",
        default_model="gpt-4o-mini",
    ),
}

DETECT_ORDER = ("dashscope", "deepseek", "openai")


@dataclass(frozen=True)
class Settings:
    provider: Provider
    api_key: str
    model: str

    @property
    def label(self) -> str:
        return f"{self.provider.name} / {self.model}"


def load_settings() -> Settings:
    forced = os.getenv("IDEALAGENT_PROVIDER", "").strip().lower()
    names = (forced,) if forced else DETECT_ORDER

    for name in names:
        provider = PROVIDERS.get(name)
        if provider is None:
            raise ValueError(
                f"未知 provider: {name}。可选: {', '.join(PROVIDERS)}"
            )
        api_key = os.getenv(provider.env_key, "").strip()
        if api_key:
            model = os.getenv("IDEALAGENT_MODEL", "").strip() or provider.default_model
            return Settings(provider=provider, api_key=api_key, model=model)

    tried = ", ".join(PROVIDERS[n].env_key for n in names if n in PROVIDERS)
    raise RuntimeError(
        "没有找到可用的 API Key。请在环境变量或 .env 中设置其中一个：\n"
        f"  {tried}\n"
        "可参考 .env.example。"
    )
