import { useEditorStore } from "../store/useEditorStore";

function scrollToHeadingByIndex(index: number) {
  const root = document.getElementById("milkdown-editor-root");
  if (!root) return;
  const headings = root.querySelectorAll("h1, h2, h3, h4, h5, h6");
  const target = headings[index];
  target?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export function OutlinePanel() {
  const outline = useEditorStore((s) => s.outline);
  const currentFilePath = useEditorStore((s) => s.currentFilePath);

  if (!currentFilePath) {
    return (
      <div className="sidebar-empty">
        <p>打开一个文档后会显示大纲</p>
      </div>
    );
  }

  if (outline.length === 0) {
    return (
      <div className="sidebar-empty">
        <p>文档还没有标题</p>
      </div>
    );
  }

  return (
    <div className="outline-panel">
      {outline.map((heading, index) => (
        <div
          key={heading.id}
          className="outline-item"
          style={{ paddingLeft: 12 + (heading.level - 1) * 14 }}
          onClick={() => scrollToHeadingByIndex(index)}
          title={heading.text}
        >
          {heading.text || "(无标题)"}
        </div>
      ))}
    </div>
  );
}
