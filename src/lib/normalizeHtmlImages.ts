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

/**
 * Crepe's image-block stores the resize *ratio* in the markdown alt field.
 * Prefer empty alt so we don't leak Typora captions/version-looking strings
 * into that slot; display still works via src.
 */
function markdownDestination(src: string): string {
  // Angle brackets keep `file:///...` and spaced paths intact for CommonMark.
  if (/[\s()<>]/.test(src) || /:\/\//.test(src)) return `<${src}>`;
  return src;
}

function imgTagToMarkdown(attrs: string): string | null {
  let src = extractAttr(attrs, "src");
  if (!src) return null;
  // Typora/Windows often emit backslashes inside file: URLs
  if (/^file:/i.test(src) && src.includes("\\")) {
    src = src.replace(/\\/g, "/");
  }

  const title = extractAttr(attrs, "title");
  const dest = markdownDestination(src);
  if (title) return `![](${dest} "${title}")`;
  return `![](${dest})`;
}

function convertOutsideFences(segment: string): string {
  return segment.replace(IMG_TAG_RE, (full, attrs: string) => {
    return imgTagToMarkdown(attrs) ?? full;
  });
}

/** Rewrite HTML <img> tags in markdown source to `![](src)` form. */
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
