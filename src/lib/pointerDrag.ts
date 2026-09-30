import { useDrag } from "../store/useDrag";

const THRESHOLD_PX = 6;

/**
 * Manual mouse-based "drag" — deliberately NOT native HTML5 draggable.
 * Native drag has a real, verified problem: any element in a draggable
 * subtree (even a plain sibling once a browser is in "maybe dragging" mode)
 * can have its click/contextmenu swallowed by a small amount of pointer
 * movement during the press, before the browser decides whether it's a
 * click or a drag — this is genuine cross-browser behavior, not something
 * `draggable={false}` on a child reliably prevents. Since this never calls
 * preventDefault unless real movement crosses the threshold, a plain click
 * (mousedown+mouseup with no meaningful movement) always fires the
 * element's normal `click`/`contextmenu` handlers completely untouched.
 *
 * Drop targets mark themselves with `data-dropzone="<zone>"`; on mouseup,
 * whatever's under the cursor is checked for the nearest such ancestor.
 */
export function startPointerDrag(e: { button: number; clientX: number; clientY: number }, onDrop: (zone: string) => void) {
  if (e.button !== 0) return;
  const startX = e.clientX;
  const startY = e.clientY;
  let dragging = false;

  function onMove(ev: MouseEvent) {
    if (dragging) return;
    if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < THRESHOLD_PX) return;
    dragging = true;
    useDrag.getState().setActive(true);
    document.body.classList.add("kt-dragging");
  }

  function onUp(ev: MouseEvent) {
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", onUp);
    document.body.classList.remove("kt-dragging");
    useDrag.getState().setActive(false);
    if (!dragging) return;
    const el = document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null;
    const zoneEl = el?.closest<HTMLElement>("[data-dropzone]");
    if (zoneEl?.dataset.dropzone) onDrop(zoneEl.dataset.dropzone);
  }

  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onUp);
}
