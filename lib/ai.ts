import crypto from "node:crypto";
import type { UserModelConfig } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const DEFAULT_AI_BASE_URL = "https://api.deepseek.com";
export const DEFAULT_AI_MODEL = "deepseek-v4-flash";

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

function encryptionKey() {
  return crypto.createHash("sha256")
    .update(process.env.SESSION_SECRET || "local-dev-session-secret-change-me")
    .digest();
}

export function encryptApiKey(apiKey: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(apiKey, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, encrypted].map((part) => part.toString("base64url")).join(".");
}

export function decryptApiKey(encrypted: string | null | undefined) {
  if (!encrypted) return "";
  const [ivText, tagText, encryptedText] = encrypted.split(".");
  if (!ivText || !tagText || !encryptedText) return "";
  try {
    const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivText, "base64url"));
    decipher.setAuthTag(Buffer.from(tagText, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(encryptedText, "base64url")),
      decipher.final()
    ]).toString("utf8");
  } catch {
    return "";
  }
}

export async function getOrCreateModelConfig(userId: number) {
  return prisma.userModelConfig.upsert({
    where: { userId },
    update: {},
    create: {
      userId,
      provider: "deepseek",
      baseUrl: DEFAULT_AI_BASE_URL,
      model: DEFAULT_AI_MODEL,
      temperature: 0.4,
      maxTokens: 1800
    }
  });
}

export function publicModelConfig(config: UserModelConfig) {
  return {
    provider: config.provider,
    baseUrl: config.baseUrl,
    model: config.model,
    temperature: config.temperature,
    maxTokens: config.maxTokens,
    hasApiKey: Boolean(config.encryptedApiKey)
  };
}

function chatEndpoint(baseUrl: string) {
  const safeBase = baseUrl.replace(/\/+$/, "");
  return safeBase.endsWith("/v1") ? `${safeBase}/chat/completions` : `${safeBase}/v1/chat/completions`;
}

export async function callChatModel(config: UserModelConfig, messages: ChatMessage[], options: { json?: boolean; maxTokens?: number } = {}) {
  const apiKey = decryptApiKey(config.encryptedApiKey);
  if (!apiKey) throw new Error("请先在用户设置中保存 DeepSeek API key。");

  const response = await fetch(chatEndpoint(config.baseUrl || DEFAULT_AI_BASE_URL), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: config.model || DEFAULT_AI_MODEL,
      messages,
      temperature: config.temperature,
      max_tokens: options.maxTokens || config.maxTokens,
      thinking: { type: "disabled" },
      ...(options.json ? { response_format: { type: "json_object" } } : {})
    })
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`模型请求失败：${response.status} ${text.slice(0, 240)}`);
  }
  const data = JSON.parse(text) as { choices?: Array<{ message?: { content?: string } }> };
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error("模型没有返回内容。");
  return content;
}

export async function createChatStream(config: UserModelConfig, messages: ChatMessage[], options: { maxTokens?: number } = {}) {
  const apiKey = decryptApiKey(config.encryptedApiKey);
  if (!apiKey) throw new Error("请先在用户设置中保存 DeepSeek API key。");

  const response = await fetch(chatEndpoint(config.baseUrl || DEFAULT_AI_BASE_URL), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: config.model || DEFAULT_AI_MODEL,
      messages,
      temperature: config.temperature,
      max_tokens: options.maxTokens || config.maxTokens,
      thinking: { type: "disabled" },
      stream: true
    })
  });

  if (!response.ok || !response.body) {
    const text = await response.text().catch(() => "");
    throw new Error(`模型请求失败：${response.status} ${text.slice(0, 240)}`);
  }

  return response.body;
}

export function parseJsonObject(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("模型返回不是 JSON 格式。");
    return JSON.parse(match[0]);
  }
}
