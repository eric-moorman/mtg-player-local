import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTour } from "../../store/useTour";
import { useGame } from "../../store/useGame";
import { TOUR_STEPS } from "../../lib/tourSteps";
import "./Tour.css";

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const SPOTLIGHT_PAD = 8;
const CARD_WIDTH = 320;
const CARD_MARGIN = 14;
const VIEWPORT_MARGIN = 16;
const LOCATE_RETRY_MS = 80;
const LOCATE_MAX_ATTEMPTS = 20;

function measure(el: HTMLElement): Rect {
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

export default function TourOverlay() {
  const active = useTour((s) => s.active);
  const stepIndex = useTour((s) => s.stepIndex);
  const next = useTour((s) => s.next);
  const prev = useTour((s) => s.prev);
  const stop = useTour((s) => s.stop);
  const setScreen = useGame((s) => s.setScreen);

  const [rect, setRect] = useState<Rect | null>(null);
  const [ready, setReady] = useState(false);
  const retryTimer = useRef<number | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [cardStyle, setCardStyle] = useState<React.CSSProperties>({
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
  });

  const step = TOUR_STEPS[stepIndex];
  const isLast = stepIndex === TOUR_STEPS.length - 1;

  const spot = rect
    ? {
        top: rect.top - SPOTLIGHT_PAD,
        left: rect.left - SPOTLIGHT_PAD,
        width: rect.width + SPOTLIGHT_PAD * 2,
        height: rect.height + SPOTLIGHT_PAD * 2,
      }
    : null;

  function handleNext() {
    if (isLast) stop();
    else next();
  }

  // Switch to the screen this step lives on.
  useEffect(() => {
    if (active && step?.screen) setScreen(step.screen);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, stepIndex]);

  // Locate & measure the step's target, retrying briefly while the new screen renders/loads.
  useEffect(() => {
    if (!active) return;
    setRect(null);
    setReady(false);

    if (!step?.selector) {
      setReady(true);
      return;
    }

    let attempts = 0;
    let cancelled = false;
    function tryLocate() {
      const el = document.querySelector(step!.selector!) as HTMLElement | null;
      if (el) {
        el.scrollIntoView({ block: "center", behavior: attempts === 0 ? "auto" : "smooth" });
        requestAnimationFrame(() => {
          if (cancelled) return;
          setRect(measure(el));
          setReady(true);
        });
        return;
      }
      attempts++;
      if (attempts > LOCATE_MAX_ATTEMPTS) {
        setReady(true); // give up — falls back to a centered card with no spotlight
        return;
      }
      retryTimer.current = window.setTimeout(tryLocate, LOCATE_RETRY_MS);
    }
    tryLocate();

    return () => {
      cancelled = true;
      if (retryTimer.current != null) window.clearTimeout(retryTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, stepIndex]);

  // Keep the spotlight glued to its target through resizes/scrolls.
  useEffect(() => {
    if (!active || !ready || !step?.selector) return;
    function reposition() {
      const el = document.querySelector(step!.selector!) as HTMLElement | null;
      if (el) setRect(measure(el));
    }
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, ready, stepIndex]);

  // Position the tooltip card after it's rendered (so we know its real height — the body
  // copy wraps differently per step) and clamp it fully inside the viewport. The spotlighted
  // element can be taller than the viewport itself (e.g. a long card-results grid), so
  // "below/above the element" isn't always on-screen — the clamp is what actually matters.
  useLayoutEffect(() => {
    if (!ready) return;
    const node = cardRef.current;
    if (!node) return;

    if (!spot) {
      setCardStyle({ top: "50%", left: "50%", transform: "translate(-50%, -50%)" });
      return;
    }

    const cardH = node.offsetHeight;
    const cardW = node.offsetWidth;
    const maxTop = Math.max(VIEWPORT_MARGIN, window.innerHeight - cardH - VIEWPORT_MARGIN);
    const maxLeft = Math.max(VIEWPORT_MARGIN, window.innerWidth - cardW - VIEWPORT_MARGIN);

    let top = spot.top + spot.height + CARD_MARGIN;
    if (top > maxTop) {
      const above = spot.top - CARD_MARGIN - cardH;
      top = above >= VIEWPORT_MARGIN ? above : maxTop;
    }
    top = Math.min(Math.max(top, VIEWPORT_MARGIN), maxTop);
    const left = Math.min(Math.max(spot.left, VIEWPORT_MARGIN), maxLeft);

    setCardStyle({ top, left, transform: "none" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, spot?.top, spot?.left, spot?.width, spot?.height]);

  // Keyboard controls.
  useEffect(() => {
    if (!active) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") stop();
      else if (e.key === "ArrowRight" || e.key === "Enter") handleNext();
      else if (e.key === "ArrowLeft") prev();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, stepIndex]);

  if (!active || !step || !ready) return null;

  return (
    <div className={"tour-backdrop" + (spot ? "" : " tour-backdrop-dim")} onClick={stop}>
      {spot && (
        <div
          className="tour-spotlight"
          style={{ top: spot.top, left: spot.left, width: spot.width, height: spot.height }}
        />
      )}
      <div
        ref={cardRef}
        className="tour-card"
        style={{ ...cardStyle, width: CARD_WIDTH }}
        role="dialog"
        aria-modal="true"
        aria-label={step.title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="tour-card-head">
          <span className="tour-step-count">{stepIndex + 1} / {TOUR_STEPS.length}</span>
          <button className="tour-close" onClick={stop} aria-label="Close tour">×</button>
        </div>
        <h3>{step.title}</h3>
        <p>{step.body}</p>
        <div className="tour-card-actions">
          <button className="btn" onClick={stop}>Skip</button>
          <div className="tour-nav-btns">
            <button className="btn" onClick={prev} disabled={stepIndex === 0}>Back</button>
            <button className="btn primary" onClick={handleNext}>{isLast ? "Done" : "Next"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
