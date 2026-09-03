import { NextResponse } from "next/server";
import { z } from "zod";
import { requireWorkspace } from "@/lib/auth";
import { getDb } from "@/lib/cloudflare";
import { createId, nowIso } from "@/lib/utils";

const CATALOG: Record<string, { name: string; category: string }> = {
  shopify: { name: "Shopify", category: "Commerce" },
  stripe: { name: "Stripe", category: "Commerce" },
  zendesk: { name: "Zendesk", category: "Helpdesk" },
  intercom: { name: "Intercom", category: "Helpdesk" },
  freshdesk: { name: "Freshdesk", category: "Helpdesk" },
  gorgias: { name: "Gorgias", category: "Helpdesk" },
  helpscout: { name: "Help Scout", category: "Helpdesk" },
  hubspot: { name: "HubSpot", category: "CRM" },
  salesforce: { name: "Salesforce", category: "CRM" },
  slack: { name: "Slack", category: "Comms" },
  whatsapp: { name: "WhatsApp", category: "Channels" },
  email: { name: "Email", category: "Channels" },
  calendly: { name: "Calendly", category: "Scheduling" },
  custom_webhook: { name: "Custom webhook", category: "Custom" },
};

export async function GET() {
  try {
    const { workspace } = await requireWorkspace();
    const db = await getDb();
    const rows = await db
      .prepare(`SELECT * FROM integrations WHERE workspace_id = ? ORDER BY updated_at DESC`)
      .bind(workspace.id)
      .all();
    return NextResponse.json({ integrations: rows.results || [], catalog: CATALOG });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 400 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const { workspace } = await requireWorkspace();
    const body = z
      .object({
        type: z.string(),
        action: z.enum(["connect_mock", "disconnect"]),
      })
      .parse(await req.json());

    const meta = CATALOG[body.type];
    if (!meta) return NextResponse.json({ error: "Unknown integration" }, { status: 400 });

    const db = await getDb();
    const existing = await db
      .prepare(`SELECT id FROM integrations WHERE workspace_id = ? AND type = ?`)
      .bind(workspace.id, body.type)
      .first<{ id: string }>();

    if (body.action === "disconnect") {
      if (existing) {
        await db
          .prepare(`UPDATE integrations SET status = 'disconnected', updated_at = ? WHERE id = ?`)
          .bind(nowIso(), existing.id)
          .run();
      }
      return NextResponse.json({ ok: true, status: "disconnected" });
    }

    // Mock connect — stores local config so helpdesk adapters can queue outbound events
    const config = {
      mode: "mock",
      connectedAt: nowIso(),
      note: "Local mock connection — replace with OAuth credentials for live delivery",
    };

    if (existing) {
      await db
        .prepare(
          `UPDATE integrations SET status = 'connected', name = ?, config = ?, updated_at = ? WHERE id = ?`,
        )
        .bind(meta.name, JSON.stringify(config), nowIso(), existing.id)
        .run();
      return NextResponse.json({ ok: true, id: existing.id, status: "connected" });
    }

    const id = createId("integ");
    await db
      .prepare(
        `INSERT INTO integrations (id, workspace_id, type, name, status, config, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'connected', ?, ?, ?)`,
      )
      .bind(id, workspace.id, body.type, meta.name, JSON.stringify(config), nowIso(), nowIso())
      .run();

    // Placeholder secret row for vault wiring later
    try {
      await db
        .prepare(
          `INSERT INTO integration_secrets (id, workspace_id, integration_id, provider, key_name, ciphertext, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'access_token', ?, ?, ?)`,
        )
        .bind(
          createId("sec"),
          workspace.id,
          id,
          body.type,
          `mock_${body.type}_token`,
          nowIso(),
          nowIso(),
        )
        .run();
    } catch {
      /* secrets table optional */
    }

    return NextResponse.json({ ok: true, id, status: "connected" });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 400 },
    );
  }
}
