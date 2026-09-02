import { getCloudflareContext } from "@opennextjs/cloudflare";

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
  TURNSTILE_SECRET_KEY?: string;
  APP_URL?: string;
  APP_NAME?: string;
};

export async function getEnv(): Promise<CloudflareEnv> {
  try {
    const { env } = await getCloudflareContext({ async: true });
    return env as unknown as CloudflareEnv;
  } catch {
    // Build-time / non-Workers contexts
    return {
      DB: undefined as unknown as D1Database,
      AUTH_SECRET: process.env.AUTH_SECRET,
      CONTEXT_DEV_API_KEY: process.env.CONTEXT_DEV_API_KEY,
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      APP_URL: process.env.APP_URL,
    };
  }
}

export async function getDb() {
  const env = await getEnv();
  if (!env.DB) {
    throw new Error("D1 database binding DB is not configured. Run with Cloudflare bindings (next dev after OpenNext init, or wrangler/opennext preview).");
  }
  return env.DB;
}
