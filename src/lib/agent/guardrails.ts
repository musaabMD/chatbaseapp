import { safeJsonParse } from "@/lib/utils";

export type GuardrailRule = {
  id?: string;
  name: string;
  condition: "always" | "keyword" | "topic" | "low_confidence" | "sensitive_action" | "human_request";
  pattern?: string;
  scope: "pre_model" | "pre_tool" | "post_model";
  action: "allow" | "block" | "escalate" | "require_confirmation" | "rewrite";
  severity: "low" | "medium" | "high";
  message?: string;
  allowedTools?: string[];
  approvalRequired?: boolean;
};

export type GuardrailDecision = {
  allow: boolean;
  escalate: boolean;
  requireConfirmation: boolean;
  message?: string;
  matched: GuardrailRule[];
};

const DEFAULT_RULES: GuardrailRule[] = [
  {
    name: "Never invent institutional facts",
    condition: "always",
    scope: "pre_model",
    action: "allow",
    severity: "high",
    message: "Only use approved sources for deadlines, tuition, policies, and requirements.",
  },
  {
    name: "Human request escalation",
    condition: "human_request",
    scope: "pre_model",
    action: "escalate",
    severity: "medium",
    message: "A human teammate can take over this conversation.",
  },
  {
    name: "Sensitive action confirmation",
    condition: "sensitive_action",
    scope: "pre_tool",
    action: "require_confirmation",
    severity: "high",
    approvalRequired: true,
  },
  {
    name: "Block unsupported promises",
    condition: "keyword",
    pattern: "guarantee|definitely approved|visa approved|admission confirmed",
    scope: "post_model",
    action: "rewrite",
    severity: "high",
    message: "I can't guarantee outcomes that require official review. I can explain the process or escalate.",
  },
];

type LegacyGuardrails = {
  blockedTopics?: string[];
  escalationKeywords?: string[];
  requireCitations?: boolean;
  piiFilter?: boolean;
  rules?: GuardrailRule[];
};

export function parseGuardrails(raw: string | null | undefined): GuardrailRule[] {
  const parsed = safeJsonParse<GuardrailRule[] | LegacyGuardrails>(raw, DEFAULT_RULES);
  if (Array.isArray(parsed)) return parsed.length ? parsed : DEFAULT_RULES;
  if (parsed.rules?.length) return parsed.rules;

  // Convert legacy dashboard JSON into GuardrailRule[]
  const converted: GuardrailRule[] = [...DEFAULT_RULES];
  if (parsed.escalationKeywords?.length) {
    converted.push({
      name: "Escalation keywords",
      condition: "keyword",
      pattern: parsed.escalationKeywords.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"),
      scope: "pre_model",
      action: "escalate",
      severity: "medium",
      message: "A human teammate can take over this conversation.",
    });
  }
  if (parsed.blockedTopics?.length) {
    converted.push({
      name: "Blocked topics",
      condition: "keyword",
      pattern: parsed.blockedTopics.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"),
      scope: "pre_model",
      action: "block",
      severity: "high",
      message: "I can't help with that topic. Please ask something else or request a human.",
    });
  }
  return converted;
}

export function evaluateGuardrails(input: {
  rules: GuardrailRule[];
  scope: GuardrailRule["scope"];
  message: string;
  confidence?: number;
  toolName?: string;
  toolSensitive?: boolean;
}): GuardrailDecision {
  const matched: GuardrailRule[] = [];
  let allow = true;
  let escalate = false;
  let requireConfirmation = false;
  let message: string | undefined;

  for (const rule of input.rules) {
    if (rule.scope !== input.scope) continue;
    let hit = false;
    if (rule.condition === "always") hit = true;
    if (rule.condition === "human_request") {
      hit = /\b(human|agent|advisor|person|representative|talk to someone)\b/i.test(input.message);
    }
    if (rule.condition === "keyword" && rule.pattern) {
      hit = new RegExp(rule.pattern, "i").test(input.message);
    }
    if (rule.condition === "low_confidence") {
      hit = typeof input.confidence === "number" && input.confidence < 0.35;
    }
    if (rule.condition === "sensitive_action") {
      hit = Boolean(input.toolSensitive);
    }
    if (!hit) continue;
    matched.push(rule);
    if (rule.action === "block") {
      allow = false;
      message = rule.message || "This request is blocked by a guardrail.";
    }
    if (rule.action === "escalate") {
      escalate = true;
      message = rule.message || message;
    }
    if (rule.action === "require_confirmation" || rule.approvalRequired) {
      requireConfirmation = true;
      message = rule.message || message;
    }
    if (rule.action === "rewrite") {
      message = rule.message || message;
    }
  }

  return { allow, escalate, requireConfirmation, message, matched };
}

export function guardrailsToPrompt(rules: GuardrailRule[]) {
  return rules
    .map(
      (r) =>
        `- ${r.name}: ${r.action.toUpperCase()} on ${r.condition}${r.pattern ? ` (${r.pattern})` : ""}${r.message ? ` — ${r.message}` : ""}`,
    )
    .join("\n");
}
