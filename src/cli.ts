#!/usr/bin/env node
import { main } from "@earendil-works/pi-coding-agent";

import { prepareIdealAgent } from "./config.js";

const args = process.argv.slice(2);
const prepared = prepareIdealAgent();
const lookingUp = args.some((arg) =>
  ["-h", "--help", "-v", "--version", "--list-models"].includes(arg),
);

if (!lookingUp && !Object.keys(prepared.keys).length) {
  console.error(
    "IdealAgent: 没有找到 API Key。请在 .env 或环境变量中设置 DASHSCOPE_API_KEY / DEEPSEEK_API_KEY / OPENAI_API_KEY。",
  );
}

await main(args);
