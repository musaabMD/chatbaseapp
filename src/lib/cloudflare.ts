import { getLocalDb, isLocalMode } from "@/lib/local-db";

export type CloudflareEnv = {
  DB: D1Database;
  FILES?: R2Bucket;
  KV?: KVNamespace;
  VECTORIZE?: VectorizeIndex;
  AI?: Ai;
  INGESTION_QUEUE?: Queue;
  ANALYTICS_QUEUE?: Queue;
  CHAT_SESSION?: DurableObjectNamespace;
  ASSETS?: Fetcher;
  AUTH_SECRET?: string;
  CONTEXT_DEV_API_KEY?: string;
  OPENAI_API_KEY?: string;
  OPENROUTER_API_KEY?: string;
  TURNSTILE_SECRET_KEY?: string;
  APP_URL?: string;
  APP_NAME?: string;
};

export async function getEnv(): Promise<CloudflareEnv> {
  // Prefer pure local mode for demo/testing without Cloudflare auth
  if (isLocalMode()) {
    return {
      DB: getLocalDb(),
      AUTH_SECRET: process.env.AUTH_SECRET || "campusly-local-dev-secret",
      CONTEXT_DEV_API_KEY: process.env.CONTEXT_DEV_API_KEY,
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
      APP_URL: process.env.APP_URL || "http://localhost:3010",
      APP_NAME: "Campusly",
    };
  }

  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const { env } = await getCloudflareContext({ async: true });
    return env as unknown as CloudflareEnv;
  } catch {
    return {
      DB: getLocalDb(),
      AUTH_SECRET: process.env.AUTH_SECRET || "campusly-local-dev-secret",
      CONTEXT_DEV_API_KEY: process.env.CONTEXT_DEV_API_KEY,
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
      APP_URL: process.env.APP_URL || "http://localhost:3010",
      APP_NAME: "Campusly",
    };
  }
}

export async function getDb() {
  const env = await getEnv();
  if (!env.DB) {
    return getLocalDb();
  }
  return env.DB;
}
