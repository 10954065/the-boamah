import Link from "next/link";
import type { ReactNode } from "react";

/** Only links to pages on this site are turned into links; anything else stays plain text. */
const INTERNAL_LINK = /\[([^\]\n]+)\]\((\/[^)\s]*)\)/g;

function inline(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(INTERNAL_LINK)) {
    const index = match.index ?? 0;
    if (index > last) parts.push(text.slice(last, index));
    parts.push(
      <Link key={index} href={match[2]!}>
        {match[1]}
      </Link>,
    );
    last = index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

type Block = { kind: "heading"; text: string } | { kind: "list"; items: string[] } | { kind: "paragraph"; lines: string[] };

function parse(text: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];
  const flush = () => {
    if (paragraph.length) blocks.push({ kind: "paragraph", lines: paragraph });
    if (list.length) blocks.push({ kind: "list", items: list });
    paragraph = [];
    list = [];
  };
  for (const raw of text.replace(/\r\n/g, "\n").split("\n")) {
    const line = raw.trim();
    if (!line) {
      flush();
    } else if (line.startsWith("## ")) {
      flush();
      blocks.push({ kind: "heading", text: line.slice(3) });
    } else if (line.startsWith("- ")) {
      if (paragraph.length) flush();
      list.push(line.slice(2));
    } else {
      if (list.length) flush();
      paragraph.push(line);
    }
  }
  flush();
  return blocks;
}

/** Renders policy text written with simple headings, lists and internal links. */
export function PolicyText({ text }: { text: string }) {
  return parse(text).map((block, index) => {
    if (block.kind === "heading") return <h2 key={index}>{inline(block.text)}</h2>;
    if (block.kind === "list") {
      return (
        <ul key={index}>
          {block.items.map((item, i) => (
            <li key={i}>{inline(item)}</li>
          ))}
        </ul>
      );
    }
    const isDateLine = index === 0 && block.lines[0]?.startsWith("Last updated");
    return (
      <p key={index} className={isDateLine ? "policy-updated" : undefined}>
        {block.lines.map((line, i) => (
          <span key={i}>
            {i > 0 ? <br /> : null}
            {inline(line)}
          </span>
        ))}
      </p>
    );
  });
}
