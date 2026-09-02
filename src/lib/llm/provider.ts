import { getEnv } from "@/lib/cloudflare";

export type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  name?: string;
};

export type GenerateOptions = {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
};

export type GenerateResult = {
  text: string;
  model: string;
  usage?: { promptTokens?: number; completionTokens?: number };
};

export type LLMProvider = {
  generate(messages: ChatMessage[], options?: GenerateOptions): Promise<GenerateResult>;
  embed(texts: string[]): Promise<number[][]>;
};

const DEFAULT_CHAT_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const DEFAULT_EMBED_MODEL = "@cf/baai/bge-base-en-v1.5";

export async function createLLMProvider(): Promise<LLMProvider> {
  const env = await getEnv();

  return {
    async generate(messages, options = {}) {
      const model = options.model || DEFAULT_CHAT_MODEL;

      if (env.AI) {
        const response = (await env.AI.run(model as Parameters<Ai["run"]>[0], {
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
          temperature: options.temperature ?? 0.3,
          max_tokens: options.maxTokens ?? 1024,
        })) as { response?: string };

        return {
          text: response.response || "",
          model,
        };
      }

      if (env.OPENAI_API_KEY || process.env.OPENAI_API_KEY) {
        const key = env.OPENAI_API_KEY || process.env.OPENAI_API_KEY!;
        const res = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: options.model || "gpt-4o-mini",
            temperature: options.temperature ?? 0.3,
            max_tokens: options.maxTokens ?? 1024,
            messages: messages.map((m) => ({ role: m.role, content: m.content })),
          }),
        });
        if (!res.ok) throw new Error(`OpenAI error: ${await res.text()}`);
        const data = (await res.json()) as {
          choices: Array<{ message: { content: string } }>;
          usage?: { prompt_tokens: number; completion_tokens: number };
        };
        return {
          text: data.choices[0]?.message.content || "",
          model: options.model || "gpt-4o-mini",
          usage: {
            promptTokens: data.usage?.prompt_tokens,
            completionTokens: data.usage?.completion_tokens,
          },
        };
      }

      // Deterministic local fallback for demos without AI bindings
      const lastUser = [...messages].reverse().find((m) => m.role === "user")?.content || "";
      const contextBlock = messages.find((m) => m.role === "system")?.content || "";
      const snippet = contextBlock.slice(0, 500);
      return {
        text: snippet
          ? `Based on institutional knowledge:\n\n${extractRelevant(snippet, lastUser)}\n\nIf you need official confirmation, contact admissions.`
          : `I can help with admissions, programs, tuition, and student support. Please add knowledge sources so I can answer with institutional accuracy.`,
        model: "campusly-fallback",
      };
    },

    async embed(texts) {
      if (env.AI) {
        const response = (await env.AI.run(DEFAULT_EMBED_MODEL, {
          text: texts,
        })) as { data?: number[][] };
        return response.data || texts.map(() => pseudoEmbed(texts[0] || ""));
      }
      return texts.map((t) => pseudoEmbed(t));
    },
  };
}

function extractRelevant(context: string, query: string) {
  const lines = context.split("\n").filter(Boolean);
  const q = query.toLowerCase();
  const matched = lines.filter((l) =>
    l.toLowerCase().split(/\W+/).some((w) => w.length > 3 && q.includes(w)),
  );
  return (matched.slice(0, 8).join("\n") || lines.slice(0, 8).join("\n")).trim();
}

/** Lightweight deterministic embedding for local/dev without Workers AI */
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

export const MODELS = [
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
    label: "GPT-4o mini",
  },
  {
    id: "gpt-4o",
    provider: "openai",
    label: "GPT-4o",
  },
] as const;
