import { NextResponse } from "next/server";
import { z } from "zod";
import { requireWorkspace } from "@/lib/auth";
import { getDb } from "@/lib/cloudflare";
import { createId, nowIso } from "@/lib/utils";
import { resolveConversation, takeOverConversation } from "@/lib/agent/escalation";

export async function POST(req: Request) {
  try {
    const { workspace, user } = await requireWorkspace();
    const body = z
      .object({
        conversationId: z.string(),
        action: z.enum(["reply", "takeover", "hold", "resolve", "note", "resume"]),
        content: z.string().optional(),
      })
      .parse(await req.json());

    const db = await getDb();
    const conversation = await db
      .prepare(`SELECT * FROM conversations WHERE id = ? AND workspace_id = ?`)
      .bind(body.conversationId, workspace.id)
      .first<{ id: string; automation_state: string | null }>();

    if (!conversation) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }

    if (body.action === "takeover") {
      await takeOverConversation({
        conversationId: body.conversationId,
        workspaceId: workspace.id,
        assigneeUserId: user.id,
      });
      return NextResponse.json({ ok: true, automation_state: "human" });
    }

    if (body.action === "hold") {
      await db
        .prepare(
          `UPDATE conversations SET automation_state = 'on_hold', handoff_status = 'on_hold', updated_at = ? WHERE id = ?`,
        )
        .bind(nowIso(), body.conversationId)
        .run();
      await db
        .prepare(`UPDATE escalations SET status = 'on_hold' WHERE conversation_id = ? AND status IN ('new', 'on_you')`)
        .bind(body.conversationId)
        .run();
      return NextResponse.json({ ok: true, automation_state: "on_hold" });
    }

    if (body.action === "resume") {
      await db
        .prepare(
          `UPDATE conversations
           SET automation_state = 'auto',
               handoff_status = 'ai',
               assigned_to = NULL,
               updated_at = ?
           WHERE id = ? AND workspace_id = ?`,
        )
        .bind(nowIso(), body.conversationId, workspace.id)
        .run();
      await db
        .prepare(
          `UPDATE escalations SET status = 'closed', resolved_at = ? WHERE conversation_id = ? AND status IN ('new', 'on_you', 'on_hold')`,
        )
        .bind(nowIso(), body.conversationId)
        .run();
      return NextResponse.json({ ok: true, automation_state: "auto" });
    }

    if (body.action === "resolve") {
      await resolveConversation({
        conversationId: body.conversationId,
        workspaceId: workspace.id,
        resolution: "HUMAN_RESOLVED",
      });
      return NextResponse.json({ ok: true, status: "closed" });
    }

    if (body.action === "note") {
      if (!body.content?.trim()) {
        return NextResponse.json({ error: "content required" }, { status: 400 });
      }
      const id = createId("note");
      await db
        .prepare(
          `INSERT INTO internal_notes (id, conversation_id, author_user_id, body, created_at) VALUES (?, ?, ?, ?, ?)`,
        )
        .bind(id, body.conversationId, user.id, body.content.trim(), nowIso())
        .run();
      return NextResponse.json({ ok: true, noteId: id });
    }

    // reply as human — pauses automation
    if (!body.content?.trim()) {
      return NextResponse.json({ error: "content required" }, { status: 400 });
    }

    if (conversation.automation_state !== "human") {
      await takeOverConversation({
        conversationId: body.conversationId,
        workspaceId: workspace.id,
        assigneeUserId: user.id,
      });
    }

    const messageId = createId("msg");
    await db
      .prepare(
        `INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?, ?, 'assistant', ?, ?)`,
      )
      .bind(messageId, body.conversationId, body.content.trim(), nowIso())
      .run();

    await db
      .prepare(
        `UPDATE conversations
         SET message_count = message_count + 1, last_message_at = ?, updated_at = ?
         WHERE id = ?`,
      )
      .bind(nowIso(), nowIso(), body.conversationId)
      .run();

    return NextResponse.json({ ok: true, messageId });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Helpdesk action failed" },
      { status: 400 },
    );
  }
}
