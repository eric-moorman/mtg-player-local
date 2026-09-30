import { create } from "zustand";
import * as cloud from "../lib/cloudSync";

interface AuthStore {
  user: cloud.AuthUser | null;
  status: "checking" | "ready";
  error: string | null;
  checkSession: () => Promise<void>;
  register: (username: string, password: string) => Promise<boolean>;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
}

export const useAuth = create<AuthStore>((set) => ({
  user: null,
  status: "checking",
  error: null,

  checkSession: async () => {
    const user = await cloud.me().catch(() => null);
    set({ user, status: "ready" });
  },

  register: async (username, password) => {
    set({ error: null });
    try {
      const user = await cloud.register(username, password);
      set({ user });
      return true;
    } catch (e: any) {
      set({ error: e?.message ?? "Registration failed." });
      return false;
    }
  },

  login: async (username, password) => {
    set({ error: null });
    try {
      const user = await cloud.login(username, password);
      set({ user });
      return true;
    } catch (e: any) {
      set({ error: e?.message ?? "Sign in failed." });
      return false;
    }
  },

  logout: async () => {
    await cloud.logout().catch(() => {});
    set({ user: null, error: null });
  },
}));
