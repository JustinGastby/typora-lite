import type { EditorView } from "@milkdown/prose/view";

type Corner = "nw" | "ne" | "sw" | "se";

const CORNERS: Corner[] = ["nw", "ne", "sw", "se"];
const MIN_SIZE = 100;
const HANDLE_CLASS = "image-corner-handle";

type GetView = () => EditorView | null;

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
    const handles = ensureHandles(wrapper);
    for (const handle of handles) {
      handle.onpointerdown = onHandlePointerDown;
    }
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
  };
}
