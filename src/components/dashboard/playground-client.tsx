"use client";

import { useState } from "react";
import { ChatPanel } from "@/components/chat/chat-panel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { STARTER_QUESTIONS, type EducationUseCase } from "@/lib/education/templates";

type DebugPayload = {
  retrieval?: Array<{ title?: string; snippet?: string; score?: number }>;
  citations?: Array<{ title: string; url?: string | null }>;
  confidence?: number;
  modelId?: string;
  latencyMs?: number;
};

export function PlaygroundClient({
  agentId,
  useCase,
  modelId,
  knowledgeMode,
  temperature,
}: {
  agentId: string;
  useCase: string;
  modelId: string;
  knowledgeMode: string;
  temperature: number;
}) {
  const [debugData, setDebugData] = useState<DebugPayload | null>(null);
  const starters =
    STARTER_QUESTIONS[useCase as EducationUseCase] || STARTER_QUESTIONS.custom;

  return (
    <div className="flex h-[calc(100vh-8rem)] min-h-[500px] gap-0 divide-x divide-[var(--border)]">
      <div className="w-64 shrink-0 space-y-4 p-4">
        <Card className="border-0 bg-transparent shadow-none">
          <CardHeader className="p-0 pb-2">
            <CardTitle className="text-sm">Config</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 p-0 text-xs">
            <div>
              <span className="text-[var(--muted)]">Model</span>
              <div className="font-mono">{modelId}</div>
            </div>
            <div>
              <span className="text-[var(--muted)]">Knowledge</span>
              <div>{knowledgeMode}</div>
            </div>
            <div>
              <span className="text-[var(--muted)]">Temperature</span>
              <div>{temperature}</div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex min-w-0 flex-1 flex-col border-x border-[var(--border)] bg-white/40">
        <div className="border-b border-[var(--border)] px-4 py-2 text-sm font-medium">
          Playground
        </div>
        <ChatPanel
          agentId={agentId}
          debug
          starterQuestions={starters}
          onDebug={(payload) => {
            const p = payload as Record<string, unknown>;
            setDebugData({
              retrieval: (p.retrieval as DebugPayload["retrieval"]) || [],
              citations: p.citations as DebugPayload["citations"],
              confidence: p.confidence as number | undefined,
              modelId: (p.modelId || p.model) as string | undefined,
              latencyMs: (p.latencyMs || p.latency_ms) as number | undefined,
            });
          }}
          className="flex-1"
        />
      </div>

      <div className="w-72 shrink-0 overflow-y-auto p-4">
        <CardTitle className="mb-3 text-sm">Retrieval debug</CardTitle>
        {!debugData ? (
          <p className="text-xs text-[var(--muted)]">Send a message to see retrieval traces.</p>
        ) : (
          <div className="space-y-3 text-xs">
            {debugData.modelId && (
              <div>
                <span className="text-[var(--muted)]">Model: </span>
                {debugData.modelId}
              </div>
            )}
            {debugData.latencyMs != null && (
              <div>
                <span className="text-[var(--muted)]">Latency: </span>
                {debugData.latencyMs}ms
              </div>
            )}
            {debugData.confidence != null && (
              <div>
                <span className="text-[var(--muted)]">Confidence: </span>
                {debugData.confidence.toFixed(2)}
              </div>
            )}
            <div className="font-medium">Chunks</div>
            {(debugData.retrieval || []).length === 0 && (
              <p className="text-[var(--muted)]">No retrieval results</p>
            )}
            {(debugData.retrieval || []).map((chunk, i) => (
              <div
                key={i}
                className="rounded-lg border border-[var(--border)] bg-white/80 p-2"
              >
                <div className="font-medium">{chunk.title || `Chunk ${i + 1}`}</div>
                {chunk.score != null && (
                  <div className="text-[var(--muted)]">Score: {chunk.score.toFixed(3)}</div>
                )}
                <div className="mt-1 line-clamp-4 opacity-80">{chunk.snippet}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
