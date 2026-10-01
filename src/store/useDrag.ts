import { create } from "zustand";

/** Whether a card is currently being manually dragged — see src/lib/pointerDrag.ts. Purely for drop-zone highlight CSS. */
export const useDrag = create<{ active: boolean; setActive: (v: boolean) => void }>((set) => ({
  active: false,
  setActive: (v) => set({ active: v }),
}));
