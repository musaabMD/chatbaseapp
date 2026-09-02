import ContextDev from "context.dev";
import { getEnv } from "@/lib/cloudflare";
import { ensureUrl, normalizeDomain } from "@/lib/utils";

export type BrandProfile = {
  domain: string;
  title?: string | null;
  description?: string | null;
  slogan?: string | null;
  colors?: Array<{ hex: string; name?: string }>;
  logos?: Array<{ url: string; mode?: string; type?: string }>;
  links?: Record<string, string | null | undefined>;
  primary_language?: string | null;
};

export type CrawlPage = {
  url: string;
  title?: string;
  markdown: string;
  description?: string;
};

export type ContextProvider = {
  scrapeUrl(url: string): Promise<{ url: string; markdown: string }>;
  crawlWebsite(options: {
    url: string;
    maxPages?: number;
    maxDepth?: number;
    urlRegex?: string;
    useMainContentOnly?: boolean;
  }): Promise<CrawlPage[]>;
  getMarkdown(url: string): Promise<string>;
  getSitemap(url: string): Promise<string[]>;
  extractStructuredData<T>(url: string, schema: Record<string, unknown>): Promise<T | null>;
  getScreenshot(url: string): Promise<{ url?: string; base64?: string } | null>;
  getBrand(domainOrUrl: string): Promise<BrandProfile | null>;
  getStyleguide(domainOrUrl: string): Promise<unknown | null>;
  getProducts(url: string): Promise<unknown[]>;
};

function createHttpClient(apiKey: string) {
  const base = "https://api.context.dev/v1";
  async function request<T>(path: string, body: Record<string, unknown>): Promise<T> {
    const res = await fetch(`${base}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Context.dev ${path} failed (${res.status}): ${text}`);
    }
    return (await res.json()) as T;
  }
  return { request };
}

export async function createContextProvider(): Promise<ContextProvider> {
  const env = await getEnv();
  const apiKey =
    env.CONTEXT_DEV_API_KEY ||
    process.env.CONTEXT_DEV_API_KEY ||
    "";

  if (!apiKey) {
    return createMockContextProvider();
  }

  const sdk = new ContextDev({ apiKey });
  const http = createHttpClient(apiKey);

  return {
    async scrapeUrl(url) {
      const target = ensureUrl(url);
      const result = await sdk.web.scrape.markdown({ url: target, useMainContentOnly: true });
      return { url: target, markdown: result.markdown || "" };
    },

    async getMarkdown(url) {
      const scraped = await this.scrapeUrl(url);
      return scraped.markdown;
    },

    async crawlWebsite(options) {
      const target = ensureUrl(options.url);
      try {
        const result = await http.request<{
          pages?: Array<{ url: string; title?: string; markdown?: string; content?: string }>;
          results?: Array<{ url: string; title?: string; markdown?: string }>;
        }>("/web/crawl", {
          url: target,
          maxPages: options.maxPages ?? 25,
          maxDepth: options.maxDepth ?? 2,
          urlRegex: options.urlRegex,
          useMainContentOnly: options.useMainContentOnly ?? true,
          includeLinks: true,
        });

        const pages = result.pages || result.results || [];
        return pages.map((p) => ({
          url: p.url,
          title: p.title,
          markdown: p.markdown || (p as { content?: string }).content || "",
        }));
      } catch {
        // Fallback: scrape homepage + try sitemap discovery
        const markdown = await this.getMarkdown(target);
        return [{ url: target, title: normalizeDomain(target), markdown }];
      }
    },

    async getSitemap(url) {
      const target = ensureUrl(url);
      try {
        const result = await http.request<{ urls?: string[]; sitemap?: string[] }>(
          "/web/sitemap",
          { url: target },
        );
        return result.urls || result.sitemap || [];
      } catch {
        return [target];
      }
    },

    async extractStructuredData<T>(url, schema) {
      try {
        const result = await http.request<{ data?: T }>("/web/extract", {
          url: ensureUrl(url),
          schema,
        });
        return result.data ?? null;
      } catch {
        return null;
      }
    },

    async getScreenshot(url) {
      try {
        const result = await http.request<{ url?: string; image?: string }>("/web/screenshot", {
          url: ensureUrl(url),
        });
        return { url: result.url, base64: result.image };
      } catch {
        return null;
      }
    },

    async getBrand(domainOrUrl) {
      const domain = normalizeDomain(domainOrUrl);
      try {
        const { brand } = await sdk.brand.retrieve({ type: "by_domain", domain });
        return brand as BrandProfile;
      } catch {
        return null;
      }
    },

    async getStyleguide(domainOrUrl) {
      const domain = normalizeDomain(domainOrUrl);
      try {
        return await http.request("/brand/styleguide", { domain });
      } catch {
        return null;
      }
    },

    async getProducts(url) {
      try {
        const result = await http.request<{ products?: unknown[] }>("/web/products", {
          url: ensureUrl(url),
        });
        return result.products || [];
      } catch {
        return [];
      }
    },
  };
}

function createMockContextProvider(): ContextProvider {
  return {
    async scrapeUrl(url) {
      const domain = normalizeDomain(url);
      return {
        url: ensureUrl(url),
        markdown: `# ${domain}\n\nWelcome to ${domain}.\n\n## Admissions\nApplications for Fall 2027 open January 15 and close March 15, 2027.\n\n## Tuition\nUndergraduate tuition is $18,500 per year. Graduate programs vary by school.\n\n## Programs\n- Computer Science (BSc)\n- Business Administration (BBA)\n- Data Science Certificate\n\n## Student Support\nContact the registrar at registrar@${domain} or visit Student Services.`,
      };
    },
    async crawlWebsite(options) {
      const domain = normalizeDomain(options.url);
      const base = ensureUrl(options.url).replace(/\/$/, "");
      return [
        {
          url: base,
          title: "Home",
          markdown: `# ${domain}\nInstitution homepage with overview of programs and student life.`,
        },
        {
          url: `${base}/admissions`,
          title: "Admissions",
          markdown: `# Admissions\n\nFall 2027 deadline: March 15, 2027.\nRequired documents: transcript, ID, personal statement.\nInternational students may need English proficiency scores.`,
        },
        {
          url: `${base}/tuition`,
          title: "Tuition & Fees",
          markdown: `# Tuition\n\nUndergraduate: $18,500 / year\nMBA: $32,000 / year\nScholarships available for need and merit.`,
        },
        {
          url: `${base}/programs/computer-science`,
          title: "Computer Science",
          markdown: `# BSc Computer Science\nDuration: 4 years\nPrerequisites: Math and introductory programming recommended.\nNext intake: September.`,
        },
      ].slice(0, options.maxPages ?? 25);
    },
    async getMarkdown(url) {
      return (await this.scrapeUrl(url)).markdown;
    },
    async getSitemap(url) {
      const base = ensureUrl(url).replace(/\/$/, "");
      return [base, `${base}/admissions`, `${base}/tuition`, `${base}/programs`];
    },
    async extractStructuredData() {
      return null;
    },
    async getScreenshot() {
      return null;
    },
    async getBrand(domainOrUrl) {
      const domain = normalizeDomain(domainOrUrl);
      return {
        domain,
        title: domain.split(".")[0]?.replace(/^\w/, (c) => c.toUpperCase()) || domain,
        description: `Education institution website for ${domain}`,
        colors: [
          { hex: "#0C5C4C", name: "Campus Teal" },
          { hex: "#E8A838", name: "Accent Gold" },
        ],
        logos: [],
        primary_language: "english",
      };
    },
    async getStyleguide() {
      return {
        colors: { accent: "#0C5C4C", background: "#F4F8F6", text: "#14231F" },
      };
    },
    async getProducts() {
      return [];
    },
  };
}
