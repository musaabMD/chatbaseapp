import { estimateTokens } from "@/lib/utils";

export type TextChunk = {
  text: string;
  heading?: string;
  index: number;
};

export function chunkMarkdown(content: string, options?: { maxChars?: number; overlap?: number }) {
  const maxChars = options?.maxChars ?? 1200;
  const overlap = options?.overlap ?? 150;
  const sections = splitByHeadings(content);
  const chunks: TextChunk[] = [];
  let index = 0;

  for (const section of sections) {
    if (section.body.length <= maxChars) {
      chunks.push({
        text: [section.heading, section.body].filter(Boolean).join("\n\n").trim(),
        heading: section.heading,
        index: index++,
      });
      continue;
    }

    let start = 0;
    while (start < section.body.length) {
      const end = Math.min(start + maxChars, section.body.length);
      const slice = section.body.slice(start, end).trim();
      if (slice) {
        chunks.push({
          text: [section.heading, slice].filter(Boolean).join("\n\n").trim(),
          heading: section.heading,
          index: index++,
        });
      }
      if (end >= section.body.length) break;
      start = Math.max(end - overlap, start + 1);
    }
  }

  return chunks.filter((c) => c.text.length > 40 || estimateTokens(c.text) > 10);
}

function splitByHeadings(content: string) {
  const lines = content.split(/\r?\n/);
  const sections: Array<{ heading?: string; body: string }> = [];
  let currentHeading: string | undefined;
  let buffer: string[] = [];

  const flush = () => {
    const body = buffer.join("\n").trim();
    if (body || currentHeading) sections.push({ heading: currentHeading, body });
    buffer = [];
  };

  for (const line of lines) {
    const heading = line.match(/^#{1,3}\s+(.+)$/);
    if (heading) {
      flush();
      currentHeading = heading[1]?.trim();
    } else {
      buffer.push(line);
    }
  }
  flush();
  return sections.length ? sections : [{ body: content }];
}
