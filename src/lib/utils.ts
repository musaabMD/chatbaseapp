import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { customAlphabet } from "nanoid";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const nanoid = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 21);

export function createId(prefix?: string) {
  return prefix ? `${prefix}_${nanoid()}` : nanoid();
}

export function slugify(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 64);
}

export function normalizeDomain(input: string) {
  try {
    const withProtocol = input.startsWith("http") ? input : `https://${input}`;
    const url = new URL(withProtocol);
    return url.hostname.replace(/^www\./, "");
  } catch {
    return input.replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "");
  }
}

export function ensureUrl(input: string) {
  return input.startsWith("http") ? input : `https://${input}`;
}

export function nowIso() {
  return new Date().toISOString();
}

export function periodKey(date = new Date()) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export async function sha256(input: string) {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function estimateTokens(text: string) {
  return Math.ceil(text.length / 4);
}

export function safeJsonParse<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
