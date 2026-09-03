import type { CSSProperties } from "react";
import { notFound } from "next/navigation";
import { getAgentByPublicSlug } from "@/lib/agents";
import { ChatPanel } from "@/components/chat/chat-panel";
import { STARTER_QUESTIONS, type EducationUseCase } from "@/lib/education/templates";
import { parseBranding } from "@/components/dashboard/branding-settings-form";
import { parseWidgetConfig } from "@/components/dashboard/widget-deploy-client";

export const dynamic = "force-dynamic";

export default async function PublicAgentPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const agent = await getAgentByPublicSlug(slug);
  if (!agent) notFound();

  const branding = parseBranding(agent.branding);
  const widget = parseWidgetConfig(agent.widget_config);
  const starters =
    STARTER_QUESTIONS[agent.use_case as EducationUseCase] || STARTER_QUESTIONS.custom;
  const primaryColor = branding.primaryColor || widget.primaryColor || "#0C5C4C";

  return (
    <main
      className="flex min-h-screen flex-col"
      style={{ "--widget-primary": primaryColor } as CSSProperties}
    >
      <header className="border-b border-[var(--border)] bg-white/80 px-6 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          {branding.logoUrl && (
            <img src={branding.logoUrl} alt="" className="h-8 w-8 rounded-lg object-contain" />
          )}
          <div>
            <h1 className="font-[family-name:var(--font-display)] text-lg font-semibold">
              {branding.headerTitle || agent.name}
            </h1>
            <p className="text-xs text-[var(--muted)]">Powered by Campusly</p>
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col">
        {widget.welcomeMessage && (
          <div className="px-4 py-3 text-sm text-[var(--muted)]">{widget.welcomeMessage}</div>
        )}
        <ChatPanel
          agentId={agent.id}
          public
          channel="hosted_page"
          starterQuestions={widget.starterQuestions ? starters.slice(0, 3) : []}
          className="flex-1 border-x border-[var(--border)] bg-white/50"
        />
      </div>
    </main>
  );
}
