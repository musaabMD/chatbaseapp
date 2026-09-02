import { getCloudflareContext } from "@opennextjs/cloudflare";

export type CloudflareEnv = {
  DB: D1Database;
  FILES: R2Bucket;
  KV: KVNamespace;
  VECTORIZE: VectorizeIndex;
  AI: Ai;
  INGESTION_QUEUE: Queue;
  ANALYTICS_QUEUE: Queue;
  CHAT_SESSION: DurableObjectNamespace;
  ASSETS: Fetcher;
  AUTH_SECRET?: string;
  CONTEXT_DEV_API_KEY?: string;
  OPENAI_API_KEY?: string;
  TURNSTILE_SECRET_KEY?: string;
  APP_URL?: string;
  APP_NAME?: string;
};

export async function getEnv(): Promise<CloudflareEnv> {
  const { env } = await getCloudflareContext({ async: true });
  return env as unknown as CloudflareEnv;
}

export async function getDb() {
  const env = await getEnv();
  if (!env.DB) {
    throw new Error("D1 database binding DB is not configured");
  }
  return env.DB;
}
