import Link from "next/link";
import { Button } from "@/components/ui/button";
import { BookOpen, MessageSquare, Sparkles, Globe2 } from "lucide-react";

export default function HomePage() {
  return (
    <main className="campus-grid min-h-screen">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--primary)] text-white">
            <BookOpen className="h-5 w-5" />
          </div>
          <span className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight">
            Campusly
          </span>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/login" className="text-sm text-[var(--foreground)]/80 hover:text-[var(--foreground)]">
            Log in
          </Link>
          <Link href="/signup">
            <Button>Get started</Button>
          </Link>
        </div>
      </header>

      <section className="relative mx-auto grid min-h-[78vh] w-full max-w-6xl items-center gap-10 px-6 pb-16 pt-6 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="fade-up">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-white/70 px-3 py-1 text-xs font-medium text-[var(--primary)] ring-1 ring-[var(--border)]">
            <Sparkles className="h-3.5 w-3.5" />
            Education AI assistants
          </div>
          <h1 className="font-[family-name:var(--font-display)] text-5xl leading-[1.05] font-semibold tracking-tight text-[var(--foreground)] md:text-6xl">
            Campusly
          </h1>
          <p className="mt-4 max-w-xl text-lg leading-relaxed text-[var(--muted)]">
            Train an AI assistant on your institution’s website, handbooks, and FAQs—then install a floating chatbot on any campus site in minutes.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/signup">
              <Button size="lg">Build your assistant</Button>
            </Link>
            <Link href="/login">
              <Button size="lg" variant="outline">
                Open dashboard
              </Button>
            </Link>
          </div>
        </div>

        <div className="fade-up-delay relative overflow-hidden rounded-[2rem] border border-[var(--border)] bg-[linear-gradient(160deg,#0c5c4c_0%,#16352f_55%,#0b2c25_100%)] p-6 text-white shadow-[0_30px_80px_rgba(12,92,76,0.28)]">
          <div className="absolute inset-0 opacity-30" style={{ backgroundImage: "radial-gradient(circle at 20% 20%, #e8a83855, transparent 35%)" }} />
          <div className="relative floaty rounded-3xl bg-white/10 p-4 backdrop-blur">
            <div className="mb-4 flex items-center justify-between">
              <div className="text-sm font-medium">Northstar Admissions</div>
              <Globe2 className="h-4 w-4 opacity-70" />
            </div>
            <div className="space-y-3 text-sm">
              <div className="max-w-[85%] rounded-2xl rounded-tl-md bg-white/15 px-3 py-2">
                When is the Fall 2027 application deadline?
              </div>
              <div className="ml-auto max-w-[90%] rounded-2xl rounded-tr-md bg-[var(--accent)] px-3 py-2 text-[var(--foreground)]">
                Applications close March 15, 2027. I can also share required documents or start your application.
              </div>
            </div>
            <div className="mt-4 flex items-center gap-2 text-xs text-white/70">
              <MessageSquare className="h-3.5 w-3.5" />
              Grounded in admissions pages + handbook
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-6xl gap-6 px-6 pb-24 md:grid-cols-3">
        {[
          {
            title: "Ingest institutional knowledge",
            body: "Crawl school websites with Context.dev, upload PDFs, and lock critical answers with approved Q&A.",
          },
          {
            title: "Deploy anywhere students already are",
            body: "Install a branded floating widget, hosted assistant page, or API on admissions and LMS sites.",
          },
          {
            title: "Improve from every conversation",
            body: "Track topics, sentiment, unanswered questions, and knowledge gaps across programs and campuses.",
          },
        ].map((item, i) => (
          <div key={item.title} className={`fade-up-delay${i ? `-${Math.min(i + 1, 2)}` : ""} rounded-3xl border border-[var(--border)] bg-white/70 p-6`}>
            <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold">{item.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">{item.body}</p>
          </div>
        ))}
      </section>
    </main>
  );
}
