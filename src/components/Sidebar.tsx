import { useState } from "react";
import type { FileNode } from "../store/useEditorStore";
import { useEditorStore } from "../store/useEditorStore";
import { openFileAtPath } from "../lib/actions";

function FileTreeNode({ node, depth }: { node: FileNode; depth: number }) {
  const [expanded, setExpanded] = useState(true);
  const currentFilePath = useEditorStore((s) => s.currentFilePath);
  const isActive = !node.isDirectory && node.path === currentFilePath;

  const handleClick = () => {
    if (node.isDirectory) {
      setExpanded((prev) => !prev);
    } else {
      openFileAtPath(node.path).catch((err) => console.error("Failed to open file:", err));
    }
  };

  return (
    <div className="file-tree-node">
      <div
        className={`file-tree-row${isActive ? " active" : ""}`}
        style={{ paddingLeft: 12 + depth * 14 }}
        onClick={handleClick}
      >
        <span className={`file-tree-icon ${node.isDirectory ? "folder" : "file"}`}>
          {node.isDirectory ? (expanded ? "▾" : "▸") : "▤"}
        </span>
        <span className="file-tree-label">{node.name}</span>
      </div>
      {node.isDirectory && expanded && node.children && (
        <div className="file-tree-children">
          {node.children.map((child) => (
            <FileTreeNode key={child.path} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export function Sidebar() {
  const fileTree = useEditorStore((s) => s.fileTree);
  const rootDir = useEditorStore((s) => s.rootDir);

  if (!rootDir) {
    return (
      <div className="sidebar-empty">
        <p>还没有打开文件夹</p>
      </div>
    );
  }

  if (fileTree.length === 0) {
    return (
      <div className="sidebar-empty">
        <p>文件夹内没有 Markdown 文件</p>
      </div>
    );
  }

  return (
    <div className="file-tree">
      {fileTree.map((node) => (
        <FileTreeNode key={node.path} node={node} depth={0} />
      ))}
    </div>
  );
}
