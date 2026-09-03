/** Lightweight topic / sentiment / language classifiers for analytics (no LLM required). */

export type SentimentLabel = "positive" | "neutral" | "negative" | "frustrated";

export function classifyTopic(message: string): string {
  const m = message.toLowerCase();
  if (/(refund|return|exchange)/.test(m)) return "Returns";
  if (/(order|shipping|track|delivery|package)/.test(m)) return "Orders";
  if (/(price|pricing|plan|subscription|billing|invoice|charge)/.test(m)) return "Billing";
  if (/(demo|sales|buy|purchase|quote)/.test(m)) return "Sales";
  if (/(book|booking|reservation|availability|check-?in|room)/.test(m)) return "Booking";
  if (/(appointment|schedule|class|session)/.test(m)) return "Scheduling";
  if (/(product|size|stock|inventory|recommend)/.test(m)) return "Products";
  if (/(tuition|fee|cost)/.test(m)) return "Tuition";
  if (/(scholarship|financial aid|aid)/.test(m)) return "Financial Aid";
  if (/(deadline|apply|admission|gpa)/.test(m)) return "Admissions";
  if (/(visa|ielts|international)/.test(m)) return "International Students";
  if (/(course|program|prerequisite)/.test(m)) return "Programs";
  if (/(password|login|reset|account)/.test(m)) return "Account Access";
  if (/(bug|error|broken|not working|outage)/.test(m)) return "Bugs";
  if (/(api|integration|webhook|sdk)/.test(m)) return "API Integration";
  if (/(human|agent|representative|speak to|talk to a person)/.test(m)) return "Escalation";
  return "General";
}

export function classifySentiment(message: string): { label: SentimentLabel; score: number } {
  const m = message.toLowerCase();
  let score = 0;
  if (/(angry|furious|ridiculous|scam|lawsuit|worst|hate|terrible|awful)/.test(m)) score -= 2;
  if (/(frustrated|urgent|asap|annoyed|disappointed|upset|charged twice)/.test(m)) score -= 1.2;
  if (/(problem|issue|wrong|failed|missing|can't|cannot|won't)/.test(m)) score -= 0.6;
  if (/(thanks|thank you|great|awesome|perfect|love|helpful)/.test(m)) score += 1.2;
  if (/(please|appreciate|ok|okay)/.test(m)) score += 0.3;

  if (score <= -1.5) return { label: "frustrated", score };
  if (score <= -0.4) return { label: "negative", score };
  if (score >= 0.8) return { label: "positive", score };
  return { label: "neutral", score };
}

/** Very small heuristic language detector for common languages. */
export function detectLanguage(message: string): string {
  if (/[\u0600-\u06FF]/.test(message)) return "ar";
  if (/[\u4e00-\u9fff]/.test(message)) return "zh";
  if (/[\u3040-\u30ff]/.test(message)) return "ja";
  if (/[\uac00-\ud7af]/.test(message)) return "ko";
  if (/\b(bonjour|merci|s'il vous plaît|où est)\b/i.test(message)) return "fr";
  if (/\b(hola|gracias|por favor|dónde)\b/i.test(message)) return "es";
  if (/\b(guten|danke|bitte|wo ist)\b/i.test(message)) return "de";
  if (/\b(obrigado|por favor|onde)\b/i.test(message)) return "pt";
  return "en";
}

export function normalizeQuestion(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s?]/g, " ")
    .replace(/\b(my|the|a|an|please|can|you|i|me|to|for|of|is|are|do|does|what|where|how|when)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}
