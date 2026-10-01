import { create } from "zustand";
import type { CardData } from "../lib/types";

interface InspectorStore {
  card: CardData | null;
  open: (card: CardData) => void;
  close: () => void;
}

export const useInspector = create<InspectorStore>((set) => ({
  card: null,
  open: (card) => set({ card }),
  close: () => set({ card: null }),
}));
