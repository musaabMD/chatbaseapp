# Campusly

AI customer-facing agent platform (Chatbase-class) with a **Build → Test → Deploy → Optimize** lifecycle.

Agents combine knowledge, instructions, procedures, tools/actions, widgets, channels, helpdesk/human handoff, analytics, and Backstage — not just “train a chatbot on your data.”

## Stack

- **Frontend:** Next.js (App Router), React, TypeScript, Tailwind CSS
- **Deploy:** Cloudflare Workers via OpenNext (`@opennextjs/cloudflare`)
- **Data:** Cloudflare D1, R2, KV, Vectorize, Queues, Workers AI
- **Models:** OpenRouter-first gateway (`LLMProvider`) with Workers AI / OpenAI / local fallback
- **Web knowledge:** Context.dev (`ContextProvider` abstraction)

## Product surfaces

- Guest demo (no sign-in) + multi-vertical templates (support, sales, ecommerce, SaaS, education, wellness, hospitality)
- Agent builder: sources, instructions, brand voice, model, procedures, actions, guardrails, tests
- Hybrid RAG (vector + lexical + rerank)
- Playground with execution traces
- Publish gate with regression tests (draft → production versions)
- Omnichannel adapters: widget, hosted page, email, WhatsApp, Messenger, Instagram, Slack, voice, in-app
- Built-in helpdesk + external helpdesk handoff adapters (Zendesk/Intercom-shaped payloads)
- Analytics: automation/resolution/escalation rates, topics, sentiment, knowledge gaps, top questions
- Backstage operator agent (ask → propose → approve draft FAQ/tests)
- Embeddable `public/widget.js` with MessagePart widgets (order, products, bookings, citations)

## Local development (no Cloudflare login)

```bash
npm install
CAMPUSLY_LOCAL=1 npm run dev -- --hostname 0.0.0.0 --port 3010
```

Open http://localhost:3010 → **Try demo — no sign-in**

Uses local SQLite in `.data/` — no `wrangler login`, no OAuth, no Workers preview.

Optional: set `OPENROUTER_API_KEY`, `CONTEXT_DEV_API_KEY`, `OPENAI_API_KEY` in `.dev.vars`.

## Cloudflare deploy

1. Authenticate Wrangler (`CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID`).
2. Create D1 / R2 / KV / Vectorize / Queues resources and update `wrangler.jsonc`.
3. Apply migrations: `npx wrangler d1 migrations apply campusly-db --remote`
4. Set secrets: `AUTH_SECRET`, `OPENROUTER_API_KEY`, optional Context/OpenAI keys
5. Deploy: `npm run deploy`

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

**Campusly** — teal (`#0C5C4C`), Fraunces + Manrope.
