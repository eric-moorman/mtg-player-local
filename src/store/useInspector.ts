import { create } from "zustand";
import type { CardData } from "../lib/types";
import { fetchPrintings, type Printing } from "../lib/scryfall";

interface InspectorStore {
  card: CardData | null;
  printings: Printing[] | null;
  printingsLoading: boolean;
  open: (card: CardData) => void;
  close: () => void;
}

export const useInspector = create<InspectorStore>((set, get) => ({
  card: null,
  printings: null,
  printingsLoading: false,
  open: (card) => {
    if (!card.name) return;
    set({ card, printings: null, printingsLoading: true });
    fetchPrintings(card.name).then((printings) => {
      // Ignore a stale response if the user already moved on to a different card.
      if (get().card?.name === card.name) set({ printings, printingsLoading: false });
    });
  },
  close: () => set({ card: null, printings: null, printingsLoading: false }),
}));
