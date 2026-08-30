import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkRehype from "remark-rehype";
import rehypeKatex from "rehype-katex";
import rehypeHighlight from "rehype-highlight";
import rehypeStringify from "rehype-stringify";
import katexCss from "katex/dist/katex.min.css?raw";
import hljsCss from "highlight.js/styles/github.css?raw";
import { localImageToDataUrl } from "./localImageUrl";
import { renderMermaidToSvg } from "./mermaidPreview";

const BASE_EXPORT_CSS = `
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif; line-height: 1.7; color: #24292e; max-width: 820px; margin: 40px auto; padding: 0 24px; }
h1, h2, h3, h4, h5, h6 { font-weight: 600; margin-top: 1.6em; margin-bottom: 0.6em; }
h1 { font-size: 2em; border-bottom: 1px solid #eaecef; padding-bottom: 0.3em; }
h2 { font-size: 1.5em; border-bottom: 1px solid #eaecef; padding-bottom: 0.3em; }
p { margin: 0.8em 0; }
img { max-width: 100%; }
pre { background: #f6f8fa; padding: 12px 16px; border-radius: 6px; overflow-x: auto; }
code { font-family: "SF Mono", Consolas, monospace; font-size: 0.9em; }
:not(pre) > code { background: rgba(27, 31, 35, 0.06); padding: 0.15em 0.4em; border-radius: 4px; }
blockquote { margin: 0.8em 0; padding: 0 1em; color: #6a737d; border-left: 4px solid #dfe2e5; }
table { border-collapse: collapse; width: 100%; margin: 1em 0; }
th, td { border: 1px solid #dfe2e5; padding: 6px 12px; }
tr:nth-child(2n) { background: #f6f8fa; }
a { color: #0969da; }
.mermaid-diagram { text-align: center; margin: 1.2em 0; }
.mermaid-diagram svg { max-width: 100%; height: auto; }
input[type="checkbox"] { margin-right: 0.4em; }
@media print {
  body { margin: 0; padding: 24px; }
}
`;

async function replaceMermaidBlocks(bodyHtml: string): Promise<string> {
  const container = document.createElement("div");
  container.innerHTML = bodyHtml;
  const codeBlocks = Array.from(
    container.querySelectorAll<HTMLElement>("pre > code.language-mermaid"),
  );

  for (const code of codeBlocks) {
    const source = code.textContent ?? "";
    const pre = code.parentElement;
    if (!pre) continue;
    try {
      const svg = await renderMermaidToSvg(source);
      const wrapper = document.createElement("div");
      wrapper.className = "mermaid-diagram";
      wrapper.innerHTML = svg;
      pre.replaceWith(wrapper);
    } catch (err) {
      console.error("Failed to render mermaid diagram for export:", err);
    }
  }

  return container.innerHTML;
}

async function markdownToHtmlBody(markdown: string): Promise<string> {
  const file = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkMath)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeKatex)
    .use(rehypeHighlight, { plainText: ["mermaid"] })
    .use(rehypeStringify, { allowDangerousHtml: true })
    .process(markdown);

  return replaceMermaidBlocks(String(file));
}

async function embedLocalImages(
  bodyHtml: string,
  sourcePath: string,
): Promise<string> {
  const container = document.createElement("div");
  container.innerHTML = bodyHtml;

  for (const image of container.querySelectorAll<HTMLImageElement>("img[src]")) {
    const src = image.getAttribute("src");
    if (!src) continue;
    try {
      const dataUrl = await localImageToDataUrl(src, sourcePath);
      if (dataUrl) image.setAttribute("src", dataUrl);
    } catch (err) {
      throw new Error(`无法内联导出图片「${src}」：${String(err)}`);
    }
  }

  return container.innerHTML;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Renders markdown into portable HTML. Styles and readable local images are
 * inlined; remote HTTP(S) images intentionally remain external. When
 * `autoPrint` is set, a small script triggers the native print dialog.
 */
export async function renderExportHtml(
  markdown: string,
  title: string,
  options?: { autoPrint?: boolean; sourcePath?: string },
): Promise<string> {
  const renderedBody = await markdownToHtmlBody(markdown);
  const bodyHtml = options?.sourcePath
    ? await embedLocalImages(renderedBody, options.sourcePath)
    : renderedBody;
  const printScript = options?.autoPrint
    ? '<script>window.addEventListener("load", () => setTimeout(() => window.print(), 300));</script>'
    : "";

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<style>${katexCss}</style>
<style>${hljsCss}</style>
<style>${BASE_EXPORT_CSS}</style>
</head>
<body>
<article class="markdown-export-body">
${bodyHtml}
</article>
${printScript}
</body>
</html>
`;
}
