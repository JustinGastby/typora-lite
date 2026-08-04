/**
 * Converts raw HTML <img> tags into Markdown image syntax so Milkdown/Crepe
 * can render them. Crepe only understands `![](...)`; Typora and other tools
 * often embed local images as `<img src="file:///...">`, which otherwise
 * shows up as plain text.
 *
 * Fenced code blocks are left untouched so example HTML snippets stay literal.
 */

const FENCE_SPLIT_RE = /(```[\s\S]*?```|~~~[\s\S]*?~~~)/g;
const IMG_TAG_RE = /<img\b([^>]*?)\/?\s*>/gi;

function extractAttr(attrs: string, name: string): string | undefined {
  const re = new RegExp(
    `${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`,
    "i",
  );
  const match = attrs.match(re);
  if (!match) return undefined;
  return match[1] ?? match[2] ?? match[3];
}

function imgTagToMarkdown(attrs: string): string | null {
  const src = extractAttr(attrs, "src");
  if (!src) return null;

  const alt = extractAttr(attrs, "alt") ?? "";
  const title = extractAttr(attrs, "title");
  if (title) return `![${alt}](${src} "${title}")`;
  return `![${alt}](${src})`;
}

function convertOutsideFences(segment: string): string {
  return segment.replace(IMG_TAG_RE, (full, attrs: string) => {
    return imgTagToMarkdown(attrs) ?? full;
  });
}

/** Rewrite HTML <img> tags in markdown source to `![alt](src)` form. */
export function normalizeHtmlImages(markdown: string): string {
  if (!markdown || !/<img\b/i.test(markdown)) return markdown;

  const parts = markdown.split(FENCE_SPLIT_RE);
  return parts
    .map((part) => {
      if (part.startsWith("```") || part.startsWith("~~~")) return part;
      return convertOutsideFences(part);
    })
    .join("");
}
