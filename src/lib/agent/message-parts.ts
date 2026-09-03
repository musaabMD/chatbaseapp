export type TextPart = {
  type: "text";
  text: string;
};

export type ProductCardPart = {
  type: "product_card";
  title: string;
  subtitle?: string;
  price?: string;
  href?: string;
  imageUrl?: string;
  attributes?: Record<string, string>;
};

export type OrderStatusPart = {
  type: "order_status";
  orderId: string;
  status: string;
  eta?: string;
  trackingUrl?: string;
};

export type BookingCardPart = {
  type: "booking_card";
  title: string;
  startsAt?: string;
  endsAt?: string;
  location?: string;
  href?: string;
};

export type AccountCardPart = {
  type: "account_card";
  title: string;
  fields: Array<{ label: string; value: string }>;
};

export type ButtonGroupPart = {
  type: "button_group";
  items: Array<{ label: string; action: string; value?: string; href?: string }>;
};

export type FormPart = {
  type: "form";
  title: string;
  formId: string;
  fields: Array<{ name: string; label: string; required?: boolean; type?: string }>;
};

export type CourseCardPart = {
  type: "course_card";
  title: string;
  subtitle?: string;
  href?: string;
  ctaLabel?: string;
};

export type CtaPart = {
  type: "cta";
  label: string;
  href: string;
};

export type CitationPart = {
  type: "citations";
  items: Array<{ title: string; url?: string | null; snippet: string }>;
};

export type MessagePart =
  | TextPart
  | ProductCardPart
  | OrderStatusPart
  | BookingCardPart
  | AccountCardPart
  | ButtonGroupPart
  | FormPart
  | CourseCardPart
  | CtaPart
  | CitationPart;

export type AgentMessagePayload = {
  parts: MessagePart[];
  text: string;
};

export function partsToPlainText(parts: MessagePart[]) {
  return parts
    .filter((p): p is TextPart => p.type === "text")
    .map((p) => p.text)
    .join("\n\n")
    .trim();
}

export function textToParts(text: string, extra: MessagePart[] = []): AgentMessagePayload {
  const parts: MessagePart[] = [{ type: "text", text }, ...extra];
  return { parts, text };
}
