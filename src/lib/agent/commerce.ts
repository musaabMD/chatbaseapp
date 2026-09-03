import type { MessagePart } from "@/lib/agent/message-parts";
import type { VerifiedIdentity } from "@/lib/agent/actions";

export type CommerceActionResult = {
  ok: boolean;
  output: Record<string, unknown>;
  parts?: MessagePart[];
  error?: string;
  needsConfirmation?: boolean;
};

/**
 * Demo commerce / booking / subscription runtimes.
 * Backend decides eligibility — LLM only reasons about the request.
 */
export function runCommerceAction(input: {
  slug: string;
  args: Record<string, unknown>;
  verifiedIdentity?: VerifiedIdentity | null;
  confirmed?: boolean;
}): CommerceActionResult | null {
  const slug = input.slug;
  const args = { ...input.args };
  if (input.verifiedIdentity) {
    for (const key of ["customer_id", "email", "account_id", "subscription_id"]) {
      if (input.verifiedIdentity[key] != null) args[key] = input.verifiedIdentity[key];
    }
  }

  if (slug === "lookup_order" || slug === "get_order_status") {
    const orderId = String(args.order_id || args.orderId || "ORD-1001");
    const output = {
      orderId,
      status: "Shipped",
      eta: "2–3 business days",
      trackingUrl: `https://example.com/track/${orderId}`,
      items: [{ sku: "TEE-NAVY-M", name: "Navy Tee", qty: 1 }],
      customer_id: args.customer_id || null,
    };
    return {
      ok: true,
      output,
      parts: [
        {
          type: "order_status",
          orderId: output.orderId,
          status: output.status,
          eta: output.eta,
          trackingUrl: output.trackingUrl,
        },
      ],
    };
  }

  if (slug === "search_products" || slug === "recommend_products") {
    const budget = Number(args.budget || args.max_price || 100);
    const useCase = String(args.use_case || args.query || "everyday");
    const products = [
      {
        title: "Everyday Essential Tee",
        subtitle: `Best for ${useCase}`,
        price: "$28",
        href: "/products/everyday-tee",
        attributes: { size: "M", stock: "in_stock", category: "apparel" },
      },
      {
        title: "All-Weather Shell",
        subtitle: "Light layer · travel ready",
        price: "$89",
        href: "/products/shell",
        attributes: { size: "M", stock: "low", category: "outerwear" },
      },
    ].filter((p) => Number(p.price.replace(/[^0-9.]/g, "")) <= budget + 20);

    return {
      ok: true,
      output: { products, filters: { budget, useCase } },
      parts: products.map((p) => ({
        type: "product_card" as const,
        ...p,
      })),
    };
  }

  if (slug === "check_return_eligibility") {
    const orderId = String(args.order_id || "ORD-1001");
    const withinWindow = args.days_since_delivery == null || Number(args.days_since_delivery) <= 30;
    return {
      ok: true,
      output: {
        orderId,
        eligible: withinWindow,
        policy: "30-day returns for unworn items with tags",
        next_step: withinWindow ? "confirm_return" : "escalate_policy_exception",
      },
    };
  }

  if (slug === "create_return" || slug === "issue_refund") {
    if (!input.confirmed) {
      return {
        ok: false,
        needsConfirmation: true,
        error: "Confirm with the customer before creating a return or refund.",
        output: {},
      };
    }
    // Eligibility is backend-owned
    const eligible = args.force !== true;
    if (!eligible) {
      return {
        ok: false,
        error: "Refund not permitted by policy. Escalate to a human.",
        output: { permitted: false },
      };
    }
    return {
      ok: true,
      output: {
        returnId: `RET-${Date.now().toString(36).toUpperCase()}`,
        status: "approved",
        refund: { amount: args.amount || 28, currency: "USD", method: "original_payment" },
      },
      parts: [
        {
          type: "account_card",
          title: "Return approved",
          fields: [
            { label: "Return ID", value: `RET-${Date.now().toString(36).toUpperCase()}` },
            { label: "Status", value: "Approved" },
          ],
        },
      ],
    };
  }

  if (slug === "get_subscription" || slug === "lookup_subscription") {
    return {
      ok: true,
      output: {
        subscription_id: args.subscription_id || "sub_demo_1",
        plan: "Pro",
        status: "active",
        renews_on: "2026-10-01",
        price: "$49/mo",
      },
      parts: [
        {
          type: "account_card",
          title: "Subscription",
          fields: [
            { label: "Plan", value: "Pro" },
            { label: "Status", value: "Active" },
            { label: "Renews", value: "2026-10-01" },
            { label: "Price", value: "$49/mo" },
          ],
        },
      ],
    };
  }

  if (slug === "update_subscription") {
    if (!input.confirmed) {
      return {
        ok: false,
        needsConfirmation: true,
        error: "Confirm plan change and proration with the customer first.",
        output: {},
      };
    }
    const plan = String(args.plan || args.desired_plan || "Business");
    return {
      ok: true,
      output: {
        subscription_id: args.subscription_id || "sub_demo_1",
        previous_plan: "Pro",
        new_plan: plan,
        proration: "$12.40 credited today",
        status: "updated",
      },
    };
  }

  if (slug === "get_availability" || slug === "get_appointment_slots") {
    const service = String(args.service || args.class || "Consultation");
    const slots = [
      { startsAt: "2026-09-04T10:00:00Z", endsAt: "2026-09-04T10:30:00Z", location: "Studio A" },
      { startsAt: "2026-09-04T14:00:00Z", endsAt: "2026-09-04T14:30:00Z", location: "Virtual" },
      { startsAt: "2026-09-05T09:00:00Z", endsAt: "2026-09-05T09:45:00Z", location: "Studio B" },
    ];
    return {
      ok: true,
      output: { service, slots },
      parts: [
        {
          type: "button_group",
          items: slots.map((s, i) => ({
            label: new Date(s.startsAt).toUTCString().replace("GMT", "UTC"),
            action: "select_slot",
            value: String(i),
          })),
        },
        ...slots.slice(0, 2).map((s) => ({
          type: "booking_card" as const,
          title: service,
          startsAt: s.startsAt,
          endsAt: s.endsAt,
          location: s.location,
        })),
      ],
    };
  }

  if (slug === "create_booking" || slug === "book_reservation") {
    if (!input.confirmed) {
      return {
        ok: false,
        needsConfirmation: true,
        error: "Confirm the selected time/room before booking.",
        output: {},
      };
    }
    const title = String(args.title || args.room || args.service || "Reservation");
    const startsAt = String(args.starts_at || "2026-09-04T10:00:00Z");
    return {
      ok: true,
      output: {
        bookingId: `BKG-${Date.now().toString(36).toUpperCase()}`,
        status: "confirmed",
        title,
        startsAt,
        rate: args.rate || "$189/night",
      },
      parts: [
        {
          type: "booking_card",
          title,
          startsAt,
          location: String(args.location || "Main property"),
          href: "/bookings/confirm",
        },
      ],
    };
  }

  if (slug === "get_room_rates") {
    return {
      ok: true,
      output: {
        property: args.property || "Harbor Inn",
        rates: [
          { room: "Deluxe King", rate: "$189", availability: "available" },
          { room: "Harbor Suite", rate: "$279", availability: "2 left" },
        ],
      },
      parts: [
        {
          type: "product_card",
          title: "Deluxe King",
          price: "$189",
          subtitle: "Available tonight",
          attributes: { beds: "1 King", view: "City" },
        },
        {
          type: "product_card",
          title: "Harbor Suite",
          price: "$279",
          subtitle: "2 left",
          attributes: { beds: "1 King + sofa", view: "Harbor" },
        },
      ],
    };
  }

  return null;
}

export const COMMERCE_ACTION_SLUGS = [
  "lookup_order",
  "get_order_status",
  "search_products",
  "recommend_products",
  "check_return_eligibility",
  "create_return",
  "issue_refund",
  "get_subscription",
  "lookup_subscription",
  "update_subscription",
  "get_availability",
  "get_appointment_slots",
  "create_booking",
  "book_reservation",
  "get_room_rates",
] as const;
