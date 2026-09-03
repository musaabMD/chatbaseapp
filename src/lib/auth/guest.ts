import { createSession, hashPassword } from "@/lib/auth";
import { getDb } from "@/lib/cloudflare";
import { createAgentRecord, createQaSource } from "@/lib/knowledge/ingestion";
import { buildInstructionTemplate } from "@/lib/agent/templates";
import { createId, nowIso } from "@/lib/utils";

const GUEST_EMAIL = "guest@campusly.demo";
const GUEST_NAME = "Demo Guest";
const DEMO_WORKSPACE_SLUG = "campusly-demo";

/**
 * Create or reuse a guest user + seeded demo workspace (no password signup required).
 * Safe to call repeatedly — idempotent on email/slug.
 */
export async function startGuestDemo() {
  const db = await getDb();

  let user = await db
    .prepare(`SELECT id, email, name FROM users WHERE email = ?`)
    .bind(GUEST_EMAIL)
    .first<{ id: string; email: string; name: string }>();

  if (!user) {
    const userId = createId("user");
    const passwordHash = await hashPassword(`guest-${createId()}`);
    await db
      .prepare(
        `INSERT INTO users (id, email, name, password_hash, email_verified, created_at, updated_at)
         VALUES (?, ?, ?, ?, 1, ?, ?)`,
      )
      .bind(userId, GUEST_EMAIL, GUEST_NAME, passwordHash, nowIso(), nowIso())
      .run();
    user = { id: userId, email: GUEST_EMAIL, name: GUEST_NAME };
  }

  let workspace = await db
    .prepare(`SELECT id, name, slug FROM workspaces WHERE slug = ?`)
    .bind(DEMO_WORKSPACE_SLUG)
    .first<{ id: string; name: string; slug: string }>();

  if (!workspace) {
    const workspaceId = createId("ws");
    await db
      .prepare(
        `INSERT INTO workspaces
        (id, name, slug, website, institution_name, brand_description, team_size, use_case, plan, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'free', ?, ?)`,
      )
      .bind(
        workspaceId,
        "Campusly Demo",
        DEMO_WORKSPACE_SLUG,
        "https://campusly.demo",
        "Acme Customer Co",
        "Demo workspace for testing the AI customer agent platform without signing up.",
        "1-10",
        "customer_support",
        nowIso(),
        nowIso(),
      )
      .run();

    await db
      .prepare(
        `INSERT INTO subscriptions (id, workspace_id, plan, status, seats, message_limit, created_at)
         VALUES (?, ?, 'free', 'active', 5, 10000, ?)`,
      )
      .bind(createId("sub"), workspaceId, nowIso())
      .run();

    workspace = { id: workspaceId, name: "Campusly Demo", slug: DEMO_WORKSPACE_SLUG };
    await seedDemoAgents(workspaceId);
  }

  const membership = await db
    .prepare(`SELECT id FROM workspace_members WHERE workspace_id = ? AND user_id = ?`)
    .bind(workspace.id, user.id)
    .first();

  if (!membership) {
    await db
      .prepare(
        `INSERT INTO workspace_members (id, workspace_id, user_id, role, created_at)
         VALUES (?, ?, ?, 'owner', ?)`,
      )
      .bind(createId("mem"), workspace.id, user.id, nowIso())
      .run();
  }

  await createSession(user.id);

  const supportAgent = await db
    .prepare(
      `SELECT id FROM agents WHERE workspace_id = ? AND use_case = 'customer_support' ORDER BY created_at ASC LIMIT 1`,
    )
    .bind(workspace.id)
    .first<{ id: string }>();

  return {
    userId: user.id,
    workspaceId: workspace.id,
    agentId: supportAgent?.id || null,
  };
}

async function seedDemoAgents(workspaceId: string) {
  const db = await getDb();

  const supportInstructions = buildInstructionTemplate({
    agentName: "Acme Support",
    organizationName: "Acme Customer Co",
    useCase: "customer_support",
    audience: "Customers",
  });

  const support = await createAgentRecord({
    workspaceId,
    name: "Acme Support",
    useCase: "customer_support",
    audience: "Customers",
    language: "en",
    instructions: supportInstructions,
    description: "Demo customer support agent with policies, procedures, and FAQ knowledge.",
    organizationName: "Acme Customer Co",
    status: "active",
  });

  await createQaSource({
    workspaceId,
    agentId: support.id,
    name: "Support FAQ",
    pairs: [
      {
        question: "What is your refund policy?",
        answer:
          "Refunds are available within 30 days of purchase for unused products. Digital goods are refundable within 14 days if unused. Contact support for approval on exceptions.",
      },
      {
        question: "How do I reset my password?",
        answer:
          "Go to Account → Security → Reset password, or use the Forgot password link on the login page. A reset email is sent within a few minutes.",
      },
      {
        question: "What are your support hours?",
        answer: "Live chat and email support run Monday–Friday, 9am–6pm local time. Urgent billing issues can be escalated anytime.",
      },
      {
        question: "How do I cancel my subscription?",
        answer:
          "You can cancel from Billing → Manage plan → Cancel. Access continues until the end of the current billing period. For enterprise contracts, ask for a human agent.",
      },
    ],
  });

  await db
    .prepare(
      `INSERT INTO procedures
      (id, agent_id, name, description, trigger_text, steps, required_actions, escalation_policy, enabled, version, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?)`,
    )
    .bind(
      createId("proc"),
      support.id,
      "Refund request",
      "Collect order details, check policy, confirm, escalate if needed",
      "refund|money back|charged twice",
      JSON.stringify([
        { type: "collect_input", instruction: "Ask for the order ID or account email." },
        { type: "instruction", instruction: "Explain the refund policy from knowledge sources." },
        {
          type: "confirmation",
          instruction: "Confirm whether the request is within the refund window before proceeding.",
        },
        {
          type: "escalation",
          instruction: "If the customer insists on an exception or payment dispute, escalate to a human with a summary.",
        },
      ]),
      JSON.stringify([]),
      JSON.stringify({ onSensitive: true }),
      nowIso(),
      nowIso(),
    )
    .run();

  await db
    .prepare(
      `INSERT INTO actions
      (id, agent_id, name, slug, description, type, enabled, requires_confirmation, is_sensitive, config, input_schema, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'http', 1, 0, 0, ?, ?, ?, ?)`,
    )
    .bind(
      createId("act"),
      support.id,
      "Lookup order status (demo)",
      "lookup_order",
      "Demo order lookup — returns mock status for playground testing",
      JSON.stringify({
        demo: true,
        mockResponse: {
          orderId: "{{order_id}}",
          status: "Shipped",
          eta: "2–3 business days",
        },
      }),
      JSON.stringify({
        type: "object",
        properties: { order_id: { type: "string" } },
        required: ["order_id"],
      }),
      nowIso(),
      nowIso(),
    )
    .run();

  const commerceActions = [
    {
      name: "Recommend products",
      slug: "recommend_products",
      description: "Filter catalog by budget/use case and return product cards",
      sensitive: 0,
      confirm: 0,
    },
    {
      name: "Get subscription",
      slug: "get_subscription",
      description: "Lookup current plan for verified customer",
      sensitive: 0,
      confirm: 0,
    },
    {
      name: "Update subscription",
      slug: "update_subscription",
      description: "Upgrade/downgrade plan after confirmation",
      sensitive: 1,
      confirm: 1,
    },
    {
      name: "Check return eligibility",
      slug: "check_return_eligibility",
      description: "Policy check before returns/refunds",
      sensitive: 0,
      confirm: 0,
    },
    {
      name: "Get appointment slots",
      slug: "get_appointment_slots",
      description: "Availability for booking workflows",
      sensitive: 0,
      confirm: 0,
    },
    {
      name: "Get room rates",
      slug: "get_room_rates",
      description: "Hospitality rates and availability",
      sensitive: 0,
      confirm: 0,
    },
  ];

  for (const action of commerceActions) {
    await db
      .prepare(
        `INSERT INTO actions
        (id, agent_id, name, slug, description, type, enabled, requires_confirmation, is_sensitive, config, input_schema, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'http', 1, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        createId("act"),
        support.id,
        action.name,
        action.slug,
        action.description,
        action.confirm,
        action.sensitive,
        JSON.stringify({ demo: true }),
        JSON.stringify({ type: "object", properties: {} }),
        nowIso(),
        nowIso(),
      )
      .run();
  }

  await db
    .prepare(`UPDATE agents SET brand_voice = ?, updated_at = ? WHERE id = ?`)
    .bind(
      "Warm, concise, and professional. Prefer plain language. Never invent policies or promises.",
      nowIso(),
      support.id,
    )
    .run();

  const admissionsInstructions = buildInstructionTemplate({
    agentName: "Northstar Admissions",
    organizationName: "Northstar University",
    useCase: "admissions",
    audience: "Prospective students",
  });

  const admissions = await createAgentRecord({
    workspaceId,
    name: "Northstar Admissions",
    useCase: "admissions",
    audience: "Prospective students",
    language: "en",
    instructions: admissionsInstructions,
    description: "Demo education admissions assistant.",
    organizationName: "Northstar University",
    status: "active",
  });

  await createQaSource({
    workspaceId,
    agentId: admissions.id,
    name: "Admissions FAQ",
    pairs: [
      {
        question: "When is the Fall application deadline?",
        answer: "Fall applications close March 15. Early decision closes November 1.",
      },
      {
        question: "What are the admission requirements?",
        answer:
          "Applicants need a completed application, transcripts, and proof of English proficiency for international students. GPA guidelines vary by program.",
      },
      {
        question: "Do you accept international students?",
        answer: "Yes. International applicants should review visa timelines and English requirements on the admissions site.",
      },
    ],
  });

  const salesInstructions = buildInstructionTemplate({
    agentName: "Acme Sales",
    organizationName: "Acme Customer Co",
    useCase: "sales",
    audience: "Prospects",
  });

  await createAgentRecord({
    workspaceId,
    name: "Acme Sales",
    useCase: "sales",
    audience: "Prospects",
    language: "en",
    instructions: salesInstructions,
    description: "Demo sales agent for pricing and demos.",
    organizationName: "Acme Customer Co",
    status: "active",
  });

  return { supportId: support.id, admissionsId: admissions.id };
}
