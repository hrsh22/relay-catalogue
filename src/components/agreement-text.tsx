import type { ReactNode } from "react";

function inlineText(text: string): ReactNode[] {
  // Only interpret the two inline conventions used by the agreement. React
  // escapes every string, including HTML, URLs and unsupported Markdown.
  return text.split(/(`[^`\n]+`|\*\*[^*\n]+\*\*)/g).map((part, index) => {
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2)
      return <code key={index}>{part.slice(1, -1)}</code>;
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4)
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    return part;
  });
}

const headingPattern = /^(#{1,6})[ \t]+(.+)$/;
const listPattern = /^(?:(\d{1,9})[.)]|([-+*]))[ \t]+(.+)$/;

/**
 * A small presentation layer for the public agreement, not a Markdown engine.
 * Unrecognised syntax stays visible as text; it cannot create HTML, links,
 * embedded images or remote requests. The linked source remains authoritative.
 */
export function AgreementText({ text }: { text: string }) {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index++;
      continue;
    }

    const heading = headingPattern.exec(line);
    if (heading) {
      // The enclosing agreement dialog already has an h2 title.
      const level = Math.min(heading[1].length + 2, 6);
      const Heading = `h${level}` as "h3" | "h4" | "h5" | "h6";
      blocks.push(<Heading key={index}>{inlineText(heading[2])}</Heading>);
      index++;
      continue;
    }

    const firstItem = listPattern.exec(line);
    if (firstItem) {
      const start = index;
      const ordered = firstItem[1] !== undefined;
      const items: ReactNode[] = [];
      while (index < lines.length) {
        const item = listPattern.exec(lines[index]);
        if (!item || (item[1] !== undefined) !== ordered) break;
        items.push(
          <li key={index} value={ordered ? Number(item[1]) : undefined}>
            {inlineText(item[3])}
          </li>,
        );
        index++;
      }
      blocks.push(
        ordered ? (
          <ol key={start} start={Number(firstItem[1])}>
            {items}
          </ol>
        ) : (
          <ul key={start}>{items}</ul>
        ),
      );
      continue;
    }

    const start = index;
    const paragraph = [line];
    index++;
    while (
      index < lines.length &&
      lines[index].trim() &&
      !headingPattern.test(lines[index]) &&
      !listPattern.test(lines[index])
    ) {
      paragraph.push(lines[index]);
      index++;
    }
    blocks.push(<p key={start}>{inlineText(paragraph.join("\n"))}</p>);
  }

  return (
    <div className="agreement-prose" style={{ overflowWrap: "anywhere" }}>
      {blocks}
    </div>
  );
}
