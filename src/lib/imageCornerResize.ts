import type { Editor } from "@milkdown/kit/core";
import { imageBlockSchema } from "@milkdown/kit/component/image-block";
import { Plugin } from "@milkdown/kit/prose/state";
import { $prose } from "@milkdown/kit/utils";
import {
  Decoration,
  DecorationSet,
  type EditorView,
} from "@milkdown/kit/prose/view";

type Corner = "nw" | "ne" | "sw" | "se";
type ImageAlignment = "left" | "center" | "right";

const CORNERS: Corner[] = ["nw", "ne", "sw", "se"];
const ALIGNMENTS: ImageAlignment[] = ["left", "center", "right"];
const MIN_SIZE = 100;
const HANDLE_CLASS = "image-corner-handle";
const TOOLBAR_CLASS = "image-block-toolbar";

type GetView = () => EditorView | null;

function normalizeAlignment(value: unknown): ImageAlignment {
  return ALIGNMENTS.includes(value as ImageAlignment)
    ? (value as ImageAlignment)
    : "center";
}

function parseImageBlockAlt(alt: unknown): {
  ratio: number;
  alignment: ImageAlignment;
} {
  const [ratioText, alignmentText] = String(alt ?? "").split("|", 2);
  let ratio = Number(ratioText || 1);
  if (Number.isNaN(ratio) || ratio <= 0) ratio = 1;
  return {
    ratio,
    alignment: normalizeAlignment(alignmentText),
  };
}

/**
 * Extends Crepe's image-block markdown format from `![1.00](...)` to
 * `![1.00|left](...)` / `![1.00|right](...)`. The original numeric form
 * remains the centered default, so existing documents stay compatible.
 */
export function configureImageBlockAlignment(editor: Editor): void {
  editor.config((ctx) => {
    ctx.update(imageBlockSchema.key, (previousFactory) => (schemaCtx) => {
      const previous = previousFactory(schemaCtx);
      return {
        ...previous,
        attrs: {
          ...previous.attrs,
          alignment: { default: "center", validate: "string" },
        },
        parseMarkdown: {
          match: ({ type }) => type === "image-block",
          runner: (state, node, type) => {
            const { ratio, alignment } = parseImageBlockAlt(node.alt);
            state.addNode(type, {
              src: String(node.url ?? ""),
              caption: String(node.title ?? ""),
              ratio,
              alignment,
            });
          },
        },
        toMarkdown: {
          match: (node) => node.type.name === "image-block",
          runner: (state, node) => {
            const ratio = Number.parseFloat(node.attrs.ratio).toFixed(2);
            const alignment = normalizeAlignment(node.attrs.alignment);
            state.openNode("paragraph");
            state.addNode("image", undefined, undefined, {
              title: node.attrs.caption,
              url: node.attrs.src,
              alt:
                alignment === "center"
                  ? ratio
                  : `${ratio}|${alignment}`,
            });
            state.closeNode();
          },
        },
      };
    });
  });

  editor.use(
    $prose(
      () =>
        new Plugin({
          props: {
            decorations(state) {
              const decorations: Decoration[] = [];
              state.doc.descendants((node, pos) => {
                if (node.type.name !== "image-block") return;
                const alignment = normalizeAlignment(node.attrs.alignment);
                decorations.push(
                  Decoration.node(pos, pos + node.nodeSize, {
                    class: `image-align-${alignment}`,
                  }),
                );
              });
              return DecorationSet.create(state.doc, decorations);
            },
          },
        }),
    ),
  );
}

function editorContentMaxWidth(block: HTMLElement): number {
  // `.milkdown-image-block` already spans the editor content column.
  const hostWidth = block.getBoundingClientRect().width;
  if (hostWidth > MIN_SIZE) return hostWidth;

  const prose = block.closest(".ProseMirror") as HTMLElement | null;
  if (prose) {
    const style = getComputedStyle(prose);
    const padX =
      (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
    return Math.max(MIN_SIZE, prose.clientWidth - padX);
  }
  return MIN_SIZE;
}

function ensureHandles(wrapper: HTMLElement): HTMLElement[] {
  const existing = CORNERS.map((c) =>
    wrapper.querySelector<HTMLElement>(`.${HANDLE_CLASS}[data-corner="${c}"]`),
  );
  if (existing.every(Boolean)) return existing as HTMLElement[];

  return CORNERS.map((corner) => {
    let el = wrapper.querySelector<HTMLElement>(
      `.${HANDLE_CLASS}[data-corner="${corner}"]`,
    );
    if (!el) {
      el = document.createElement("div");
      el.className = HANDLE_CLASS;
      el.dataset.corner = corner;
      el.setAttribute("contenteditable", "false");
      wrapper.appendChild(el);
    }
    return el;
  });
}

function findImageBlockPos(view: EditorView, block: HTMLElement): number | null {
  let found: number | null = null;
  view.state.doc.descendants((node, pos) => {
    if (found !== null) return false;
    if (node.type.name !== "image-block") return;
    const dom = view.nodeDOM(pos);
    if (dom === block || (dom instanceof HTMLElement && dom.contains(block))) {
      found = pos;
      return false;
    }
    if (block.contains(dom as Node)) {
      found = pos;
      return false;
    }
  });
  return found;
}

function syncAlignmentClass(
  view: EditorView,
  block: HTMLElement,
): ImageAlignment {
  const pos = findImageBlockPos(view, block);
  const alignment =
    pos === null
      ? "center"
      : normalizeAlignment(view.state.doc.nodeAt(pos)?.attrs.alignment);
  for (const value of ALIGNMENTS) {
    block.classList.toggle(`image-align-${value}`, value === alignment);
  }
  block
    .querySelectorAll<HTMLButtonElement>(`.${TOOLBAR_CLASS} [data-align]`)
    .forEach((button) => {
      const active = button.dataset.align === alignment;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
  return alignment;
}

function setImageAlignment(
  view: EditorView,
  block: HTMLElement,
  alignment: ImageAlignment,
): void {
  const pos = findImageBlockPos(view, block);
  if (pos === null) return;
  const node = view.state.doc.nodeAt(pos);
  if (!node || node.type.name !== "image-block") return;
  view.dispatch(
    view.state.tr
      .setNodeMarkup(pos, undefined, {
        ...node.attrs,
        alignment,
      })
      .scrollIntoView(),
  );
  syncAlignmentClass(view, block);
}

function deleteImageBlock(view: EditorView, block: HTMLElement): void {
  const pos = findImageBlockPos(view, block);
  if (pos === null) return;
  const node = view.state.doc.nodeAt(pos);
  if (!node || node.type.name !== "image-block") return;
  view.dispatch(
    view.state.tr.delete(pos, pos + node.nodeSize).scrollIntoView(),
  );
}

function createToolbarButton(
  label: string,
  title: string,
  action: () => void,
): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.title = title;
  button.setAttribute("aria-label", title);
  button.setAttribute("contenteditable", "false");
  button.onpointerdown = (event) => {
    event.preventDefault();
    event.stopPropagation();
  };
  button.onclick = (event) => {
    event.preventDefault();
    event.stopPropagation();
    action();
  };
  return button;
}

function ensureToolbar(
  block: HTMLElement,
  getView: GetView,
): HTMLElement {
  const existing = block.querySelector<HTMLElement>(
    `:scope > .${TOOLBAR_CLASS}`,
  );
  if (existing) return existing;

  const toolbar = document.createElement("div");
  toolbar.className = TOOLBAR_CLASS;
  toolbar.setAttribute("role", "toolbar");
  toolbar.setAttribute("aria-label", "图片排列");
  toolbar.setAttribute("contenteditable", "false");

  const options: Array<[ImageAlignment, string, string]> = [
    ["left", "左", "图片靠左"],
    ["center", "中", "图片居中"],
    ["right", "右", "图片靠右"],
  ];
  for (const [alignment, label, title] of options) {
    const button = createToolbarButton(label, title, () => {
      const view = getView();
      if (view) setImageAlignment(view, block, alignment);
    });
    button.dataset.align = alignment;
    toolbar.appendChild(button);
  }

  const divider = document.createElement("span");
  divider.className = "image-block-toolbar-divider";
  divider.setAttribute("aria-hidden", "true");
  toolbar.appendChild(divider);

  const deleteButton = createToolbarButton("×", "Delete image (undoable)", () => {
    const view = getView();
    if (view) deleteImageBlock(view, block);
  });
  deleteButton.className = "danger";
  toolbar.appendChild(deleteButton);

  block.prepend(toolbar);
  return toolbar;
}

function persistRatio(view: EditorView, block: HTMLElement, ratio: number): void {
  const pos = findImageBlockPos(view, block);
  if (pos === null) return;
  const node = view.state.doc.nodeAt(pos);
  if (!node || node.type.name !== "image-block") return;
  const next = Number.parseFloat(ratio.toFixed(2));
  if (Number.isNaN(next) || next === node.attrs.ratio) return;
  view.dispatch(
    view.state.tr.setNodeMarkup(pos, undefined, {
      ...node.attrs,
      ratio: next,
    }),
  );
}

function applySize(image: HTMLImageElement, width: number, height: number): void {
  image.style.width = `${width.toFixed(2)}px`;
  image.style.height = `${height.toFixed(2)}px`;
  image.style.maxWidth = "none";
  image.dataset.height = height.toFixed(2);
}

/**
 * Adds Typora-like four-corner resize handles to Milkdown image-block nodes.
 * Replaces the built-in bottom bar handle (hidden via CSS).
 */
export function attachImageCornerResize(
  root: HTMLElement,
  getView: GetView,
): () => void {
  let active: {
    corner: Corner;
    image: HTMLImageElement;
    block: HTMLElement;
    startX: number;
    startY: number;
    startW: number;
    startH: number;
    aspect: number;
    maxW: number;
    originH: number;
  } | null = null;

  const onPointerMove = (e: PointerEvent) => {
    if (!active) return;
    e.preventDefault();

    const { corner, image, startX, startY, startW, startH, aspect, maxW } = active;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    // Use the dominant axis projected onto aspect ratio for stable corner drag.
    let nextW = startW;
    switch (corner) {
      case "se":
        nextW = startW + dx;
        break;
      case "sw":
        nextW = startW - dx;
        break;
      case "ne":
        nextW = startW + dx;
        break;
      case "nw":
        nextW = startW - dx;
        break;
    }

    // Also respond to vertical drag (project through aspect).
    let fromHeight = startH;
    switch (corner) {
      case "se":
      case "sw":
        fromHeight = startH + dy;
        break;
      case "ne":
      case "nw":
        fromHeight = startH - dy;
        break;
    }
    const widthFromHeight = fromHeight * aspect;
    // Blend: pick the change with larger relative magnitude so either axis works.
    const relW = Math.abs(nextW - startW) / startW;
    const relH = Math.abs(fromHeight - startH) / startH;
    if (relH > relW) nextW = widthFromHeight;

    nextW = Math.min(maxW, Math.max(MIN_SIZE, nextW));
    let nextH = nextW / aspect;
    if (nextH < MIN_SIZE) {
      nextH = MIN_SIZE;
      nextW = Math.min(maxW, nextH * aspect);
      nextH = nextW / aspect;
    }

    applySize(image, nextW, nextH);
  };

  const onPointerUp = () => {
    if (!active) return;
    const { image, block, originH } = active;
    active = null;
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);

    const currentH = Number(image.dataset.height) || image.getBoundingClientRect().height;
    const origin = originH || Number(image.dataset.origin) || currentH;
    if (!origin) return;
    const ratio = currentH / origin;
    const view = getView();
    if (view) persistRatio(view, block, ratio);
  };

  const onHandlePointerDown = (e: PointerEvent) => {
    const handle = e.currentTarget as HTMLElement;
    const corner = handle.dataset.corner as Corner | undefined;
    if (!corner) return;

    const wrapper = handle.closest(".image-wrapper") as HTMLElement | null;
    const block = handle.closest(".milkdown-image-block") as HTMLElement | null;
    const image = wrapper?.querySelector<HTMLImageElement>("img");
    if (!wrapper || !block || !image) return;

    e.preventDefault();
    e.stopPropagation();

    const rect = image.getBoundingClientRect();
    const startW = rect.width;
    const startH = rect.height;
    const naturalAspect =
      image.naturalWidth && image.naturalHeight
        ? image.naturalWidth / image.naturalHeight
        : startW / startH;

    let originH = Number(image.dataset.origin);
    if (!originH || Number.isNaN(originH)) {
      // Fallback: treat current size / ratio attr as origin reference.
      originH = startH;
      image.dataset.origin = originH.toFixed(2);
    }

    active = {
      corner,
      image,
      block,
      startX: e.clientX,
      startY: e.clientY,
      startW,
      startH,
      aspect: naturalAspect || 1,
      maxW: editorContentMaxWidth(block),
      originH,
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  };

  const enhanceBlock = (block: HTMLElement) => {
    const wrapper = block.querySelector<HTMLElement>(":scope > .image-wrapper");
    if (!wrapper) return;
    ensureToolbar(block, getView);
    const handles = ensureHandles(wrapper);
    for (const handle of handles) {
      handle.onpointerdown = onHandlePointerDown;
    }
    const view = getView();
    if (view) syncAlignmentClass(view, block);
  };

  const scan = () => {
    root.querySelectorAll<HTMLElement>(".milkdown-image-block").forEach(enhanceBlock);
  };

  scan();

  const observer = new MutationObserver(() => scan());
  observer.observe(root, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["class", "src"],
  });

  return () => {
    observer.disconnect();
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    root.querySelectorAll<HTMLElement>(`.${HANDLE_CLASS}`).forEach((el) => {
      el.onpointerdown = null;
      el.remove();
    });
    root.querySelectorAll<HTMLElement>(`.${TOOLBAR_CLASS}`).forEach((el) => {
      el.querySelectorAll<HTMLButtonElement>("button").forEach((button) => {
        button.onpointerdown = null;
        button.onclick = null;
      });
      el.remove();
    });
  };
}
