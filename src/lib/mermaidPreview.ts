let initialized = false;
let counter = 0;

/**
 * `mermaid` (plus its diagram-type chunks) is only imported lazily on first
 * use, so documents without any mermaid code fences never pay for it.
 */
export async function renderMermaidToSvg(source: string): Promise<string> {
  const { default: mermaid } = await import("mermaid");
  if (!initialized) {
    mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: "default" });
    initialized = true;
  }
  const id = `mermaid-preview-${Date.now()}-${counter++}`;
  const { svg } = await mermaid.render(id, source);
  return svg;
}
