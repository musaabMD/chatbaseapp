# Campusly

Education-focused AI assistant platform (Chatbase-class product category) built Cloudflare-first.

Institutions create assistants, train them on websites/files/Q&A, configure behavior and actions, test in a playground, and deploy a floating website widget or hosted assistant page.

## Stack

- **Frontend:** Next.js (App Router), React, TypeScript, Tailwind CSS
- **Deploy:** Cloudflare Workers via OpenNext (`@opennextjs/cloudflare`)
- **Data:** Cloudflare D1, R2, KV, Vectorize, Queues, Workers AI
- **Web knowledge:** Context.dev (`ContextProvider` abstraction)
- **Models:** Provider abstraction (`LLMProvider`) — Workers AI + OpenAI-ready

## Product surfaces

- Marketing + auth + guided education onboarding
- Multi-tenant workspaces
- Assistant builder (instructions, knowledge, actions, procedures, guardrails, tests)
- Playground with retrieval debug
- Inbox, contacts, analytics, usage, billing stubs
- Embeddable `public/widget.js` + hosted `/a/[slug]` page
- Domain allowlisting for widget embeds

## Local development

```bash
npm install
cp .dev.vars.example .dev.vars
# Optional: CONTEXT_DEV_API_KEY, OPENAI_API_KEY, AUTH_SECRET

npx wrangler d1 migrations apply campusly-db --local
npm run dev
```

Preview in the Workers runtime:

```bash
npm run preview
```

## Cloudflare deploy

1. Authenticate Wrangler (`CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID`).
2. Create resources:

```bash
npx wrangler d1 create campusly-db
npx wrangler r2 bucket create campusly-files
npx wrangler kv namespace create campusly-kv
npx wrangler vectorize create campusly-knowledge --dimensions=768 --metric=cosine
npx wrangler queues create campusly-ingestion
npx wrangler queues create campusly-analytics
```

3. Update `wrangler.jsonc` IDs.
4. Apply migrations: `npx wrangler d1 migrations apply campusly-db --remote`
5. Set secrets: `AUTH_SECRET`, `CONTEXT_DEV_API_KEY`, optional `OPENAI_API_KEY`
6. Deploy: `npm run deploy`

## Widget install

```html
<script
  src="https://YOUR_DOMAIN/widget.js"
  data-agent-id="agent_xxx"
  async>
</script>
```

Browser API: `window.campusly.open()`, `.close()`, `.toggle()`, `.sendMessage()`, `.identify()`, `.setContext()`.

## Brand

**Campusly** — teal academic system (`#0C5C4C`), Fraunces + Manrope, education-native copy and workflows.
