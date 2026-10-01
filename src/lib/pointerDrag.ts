import { useDrag } from "../store/useDrag";

const THRESHOLD_PX = 6;
const LONG_PRESS_MS = 450;

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
 * Also detects a long-press (hold without moving) as an alternative to
 * right-click — two-finger-tap-to-right-click on a trackpad is a known,
 * widely-documented cross-OS/driver inconsistency that isn't fully
 * controllable from JS, so this gives trackpad users a reliable fallback
 * for opening the same menu.
 *
 * Drop targets mark themselves with `data-dropzone="<zone>"`; on mouseup,
 * whatever's under the cursor is checked for the nearest such ancestor.
 */

let suppressNextClick = false;

/** Call at the top of a tile's onClick — returns true (and consumes the flag) if the
 *  preceding gesture was a drag or long-press, so the caller should skip its normal click action. */
export function consumeSuppressedClick(): boolean {
  if (suppressNextClick) {
    suppressNextClick = false;
    return true;
  }
  return false;
}

export function startPointerDrag(
  e: { button: number; clientX: number; clientY: number },
  onDrop: (zone: string) => void,
  onLongPress?: () => void
) {
  if (e.button !== 0) return;
  const startX = e.clientX;
  const startY = e.clientY;
  let dragging = false;
  let longPressed = false;

  const timer = onLongPress
    ? window.setTimeout(() => {
        longPressed = true;
        suppressNextClick = true;
        cleanup();
        document.body.classList.remove("kt-dragging");
        useDrag.getState().setActive(false);
        onLongPress();
      }, LONG_PRESS_MS)
    : null;

  function onMove(ev: MouseEvent) {
    if (dragging || longPressed) return;
    if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < THRESHOLD_PX) return;
    if (timer != null) window.clearTimeout(timer);
    dragging = true;
    suppressNextClick = true;
    useDrag.getState().setActive(true);
    document.body.classList.add("kt-dragging");
  }

  function cleanup() {
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", onUp);
    if (timer != null) window.clearTimeout(timer);
  }

  function onUp(ev: MouseEvent) {
    cleanup();
    document.body.classList.remove("kt-dragging");
    useDrag.getState().setActive(false);
    if (longPressed || !dragging) return;
    const el = document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null;
    const zoneEl = el?.closest<HTMLElement>("[data-dropzone]");
    if (zoneEl?.dataset.dropzone) onDrop(zoneEl.dataset.dropzone);
  }

  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onUp);
}
