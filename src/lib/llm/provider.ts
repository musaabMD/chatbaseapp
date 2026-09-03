import { getEnv } from "@/lib/cloudflare";

export type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  name?: string;
  tool_call_id?: string;
};

export type GenerateOptions = {
  model?: string;
  provider?: string;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  fallbackModel?: string;
};

export type GenerateResult = {
  text: string;
  model: string;
  provider: string;
  usage?: { promptTokens?: number; completionTokens?: number };
};

export type LLMProvider = {
  id: string;
  generate(messages: ChatMessage[], options?: GenerateOptions): Promise<GenerateResult>;
  embed(texts: string[]): Promise<number[][]>;
};

const DEFAULT_EMBED_MODEL = "@cf/baai/bge-base-en-v1.5";

export const MODELS = [
  {
    id: "openrouter/auto",
    provider: "openrouter",
    label: "OpenRouter Auto",
  },
  {
    id: "openai/gpt-4o-mini",
    provider: "openrouter",
    label: "GPT-4o mini (OpenRouter)",
  },
  {
    id: "openai/gpt-4o",
    provider: "openrouter",
    label: "GPT-4o (OpenRouter)",
  },
  {
    id: "anthropic/claude-sonnet-4",
    provider: "openrouter",
    label: "Claude Sonnet 4 (OpenRouter)",
  },
  {
    id: "google/gemini-2.5-flash",
    provider: "openrouter",
    label: "Gemini 2.5 Flash (OpenRouter)",
  },
  {
    id: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
    provider: "workers-ai",
    label: "Llama 3.3 70B (Workers AI)",
  },
  {
    id: "@cf/meta/llama-3.1-8b-instruct",
    provider: "workers-ai",
    label: "Llama 3.1 8B (Workers AI)",
  },
  {
    id: "gpt-4o-mini",
    provider: "openai",
    label: "GPT-4o mini (OpenAI direct)",
  },
] as const;

export type ModelCatalogEntry = (typeof MODELS)[number];

function resolveProvider(modelId?: string, explicit?: string) {
  if (explicit) return explicit;
  const found = MODELS.find((m) => m.id === modelId);
  if (found) return found.provider;
  if (modelId?.startsWith("@cf/")) return "workers-ai";
  if (modelId?.includes("/")) return "openrouter";
  return "openrouter";
}

async function callOpenRouter(input: {
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
}): Promise<GenerateResult> {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.APP_URL || "https://campusly.local",
      "X-Title": "Campusly",
    },
    body: JSON.stringify({
      model: input.model === "openrouter/auto" ? "openrouter/auto" : input.model,
      temperature: input.temperature ?? 0.3,
      max_tokens: input.maxTokens ?? 1024,
      messages: input.messages.map((m) => ({ role: m.role, content: m.content })),
    }),
  });
  if (!res.ok) throw new Error(`OpenRouter error: ${await res.text()}`);
  const data = (await res.json()) as {
    choices: Array<{ message: { content: string } }>;
    model?: string;
    usage?: { prompt_tokens: number; completion_tokens: number };
  };
  return {
    text: data.choices[0]?.message.content || "",
    model: data.model || input.model,
    provider: "openrouter",
    usage: {
      promptTokens: data.usage?.prompt_tokens,
      completionTokens: data.usage?.completion_tokens,
    },
  };
}

async function callOpenAI(input: {
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
}): Promise<GenerateResult> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: input.model,
      temperature: input.temperature ?? 0.3,
      max_tokens: input.maxTokens ?? 1024,
      messages: input.messages.map((m) => ({ role: m.role, content: m.content })),
    }),
  });
  if (!res.ok) throw new Error(`OpenAI error: ${await res.text()}`);
  const data = (await res.json()) as {
    choices: Array<{ message: { content: string } }>;
    usage?: { prompt_tokens: number; completion_tokens: number };
  };
  return {
    text: data.choices[0]?.message.content || "",
    model: input.model,
    provider: "openai",
    usage: {
      promptTokens: data.usage?.prompt_tokens,
      completionTokens: data.usage?.completion_tokens,
    },
  };
}

function localFallback(messages: ChatMessage[]): GenerateResult {
  const lastUser = [...messages].reverse().find((m) => m.role === "user")?.content || "";
  const contextBlock = messages.find((m) => m.role === "system")?.content || "";
  const knowledgeSection = (() => {
    const after = contextBlock.split("Retrieved knowledge:")[1] || "";
    return after.split("\n\nReturn helpful")[0] || after.split("\nReturn helpful")[0] || after;
  })();
  const toolSection = /Tool result/.test(knowledgeSection) ? knowledgeSection : "";
  const snippet = extractRelevant(knowledgeSection, lastUser);
  if (toolSection) {
    const toolMatch = toolSection.match(/Tool result \([^)]+\):\n([\s\S]+)/);
    const raw = (toolMatch?.[1] || "").trim().split("\n\nReturn helpful")[0].trim().slice(0, 800);
    return {
      text: raw
        ? `Here's what I found:\n\n\`\`\`json\n${raw}\n\`\`\`\n\nI can also help with returns or connect you to a human.`
        : `I looked that up for you. Ask if you need a return, refund, or human handoff.`,
      model: "campusly-fallback",
      provider: "local",
    };
  }
  return {
    text: snippet
      ? `Based on approved knowledge:\n\n${snippet}\n\nIf this needs confirmation or a human decision, I can escalate.`
      : `I can help using your configured knowledge, procedures, and actions. Add sources or connect tools for stronger answers.`,
    model: "campusly-fallback",
    provider: "local",
  };
}

function extractRelevant(context: string, query: string) {
  const lines = context.split("\n").filter(Boolean);
  const q = query.toLowerCase();
  const matched = lines.filter((l) =>
    l.toLowerCase().split(/\W+/).some((w) => w.length > 3 && q.includes(w)),
  );
  return (matched.slice(0, 10).join("\n") || lines.slice(0, 10).join("\n")).trim();
}

function pseudoEmbed(text: string, dims = 384): number[] {
  const vec = new Array(dims).fill(0);
  const tokens = text.toLowerCase().split(/\W+/).filter(Boolean);
  for (const token of tokens) {
    let h = 0;
    for (let i = 0; i < token.length; i++) h = (h * 31 + token.charCodeAt(i)) >>> 0;
    vec[h % dims] += 1;
    vec[(h * 7) % dims] += 0.5;
  }
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
  return vec.map((v) => v / norm);
}

/**
 * Model gateway: OpenRouter-first, then Workers AI, OpenAI direct, local fallback.
 * Agent configs should store provider + model + fallback independently.
 */
export async function createLLMProvider(): Promise<LLMProvider> {
  const env = await getEnv();
  const openRouterKey =
    (env as { OPENROUTER_API_KEY?: string }).OPENROUTER_API_KEY ||
    process.env.OPENROUTER_API_KEY ||
    "";
  const openAiKey = env.OPENAI_API_KEY || process.env.OPENAI_API_KEY || "";

  return {
    id: "campusly-gateway",

    async generate(messages, options = {}) {
      const model = options.model || (openRouterKey ? "openai/gpt-4o-mini" : "@cf/meta/llama-3.3-70b-instruct-fp8-fast");
      const provider = resolveProvider(model, options.provider);
      const attempt = async (modelId: string, providerId: string) => {
        if (providerId === "openrouter") {
          if (!openRouterKey) throw new Error("OPENROUTER_API_KEY is not configured");
          return callOpenRouter({
            apiKey: openRouterKey,
            model: modelId,
            messages,
            temperature: options.temperature,
            maxTokens: options.maxTokens,
          });
        }
        if (providerId === "openai") {
          if (!openAiKey) throw new Error("OPENAI_API_KEY is not configured");
          return callOpenAI({
            apiKey: openAiKey,
            model: modelId.replace(/^openai\//, ""),
            messages,
            temperature: options.temperature,
            maxTokens: options.maxTokens,
          });
        }
        if (providerId === "workers-ai" && env.AI) {
          const response = (await env.AI.run(modelId as Parameters<Ai["run"]>[0], {
            messages: messages.map((m) => ({ role: m.role, content: m.content })),
            temperature: options.temperature ?? 0.3,
            max_tokens: options.maxTokens ?? 1024,
          })) as { response?: string };
          return {
            text: response.response || "",
            model: modelId,
            provider: "workers-ai",
          };
        }
        throw new Error(`Provider ${providerId} unavailable for model ${modelId}`);
      };

      try {
        return await attempt(model, provider);
      } catch (primaryError) {
        if (options.fallbackModel) {
          try {
            const fallbackProvider = resolveProvider(options.fallbackModel);
            return await attempt(options.fallbackModel, fallbackProvider);
          } catch {
            /* fall through */
          }
        }
        if (openRouterKey && provider !== "openrouter") {
          try {
            return await callOpenRouter({
              apiKey: openRouterKey,
              model: "openai/gpt-4o-mini",
              messages,
              temperature: options.temperature,
              maxTokens: options.maxTokens,
            });
          } catch {
            /* fall through */
          }
        }
        if (process.env.CAMPUSLY_LOCAL === "1" || !openRouterKey) {
          return localFallback(messages);
        }
        throw primaryError;
      }
    },

    async embed(texts) {
      if (env.AI) {
        const response = (await env.AI.run(DEFAULT_EMBED_MODEL, {
          text: texts,
        })) as { data?: number[][] };
        return response.data || texts.map((t) => pseudoEmbed(t));
      }
      return texts.map((t) => pseudoEmbed(t));
    },
  };
}
