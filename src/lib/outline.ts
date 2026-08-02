import type { HeadingItem } from "../store/useEditorStore";

const HEADING_RE = /^(#{1,6})\s+(.+?)\s*#*$/;
const FENCE_RE = /^\s*(```|~~~)/;

/**
 * Extracts a flat, document-order list of headings from raw markdown source.
 * This intentionally stays index-aligned with the `h1..h6` elements Milkdown
 * renders in the DOM, so `OutlinePanel` can jump to a heading by ordinal
 * position without needing ProseMirror node positions.
 */
export function extractOutline(markdown: string): HeadingItem[] {
  const lines = markdown.split("\n");
  const headings: HeadingItem[] = [];
  let inFence = false;

  lines.forEach((line, index) => {
    if (FENCE_RE.test(line)) {
      inFence = !inFence;
      return;
    }
    if (inFence) return;

    const match = line.match(HEADING_RE);
    if (match) {
      headings.push({
        id: `heading-${index}-${headings.length}`,
        level: match[1].length,
        text: match[2].trim(),
      });
    }
  });

  return headings;
}
