"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { renderForChannel } from "@/lib/agent/channels";

const SAMPLE_TEXT =
  "Your order ORD-1001 shipped yesterday and should arrive by Friday. Reply if you need to change the address.";

const PREVIEW_CHANNELS = ["email", "slack", "whatsapp", "messenger", "voice", "widget"] as const;

export function ChannelDeliverySimulator() {
  const [channel, setChannel] = useState<(typeof PREVIEW_CHANNELS)[number]>("email");
  const [text, setText] = useState(SAMPLE_TEXT);

  const payload = useMemo(
    () =>
      renderForChannel(channel, text, [
        { type: "text", text },
        { type: "button", label: "Track package", action: "track_order" },
      ]),
    [channel, text],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Delivery simulator</CardTitle>
        <CardDescription>
          Preview how MessageParts render for each channel — no live send required.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {PREVIEW_CHANNELS.map((c) => (
            <Button
              key={c}
              size="sm"
              variant={channel === c ? "default" : "secondary"}
              onClick={() => setChannel(c)}
            >
              {c}
            </Button>
          ))}
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          className="w-full rounded-xl border border-[var(--border)] bg-white/80 p-3 text-sm outline-none focus:border-[var(--primary)]"
        />
        <pre className="overflow-x-auto rounded-xl bg-[var(--secondary)]/70 p-3 text-xs leading-relaxed">
          {JSON.stringify(payload, null, 2)}
        </pre>
      </CardContent>
    </Card>
  );
}
