/**
 * Re-runs every store's already-auth-aware load action after the signed-in
 * state changes (sign in, sign out, or an initial session check on app
 * mount). Each action independently checks useAuth's current user and reads
 * from the account's synced blob or local storage accordingly — this just
 * re-triggers all of them together so the UI doesn't have to remember the
 * full list at every call site (App.tsx on mount, Settings.tsx after
 * login/register/logout).
 */
import { useGame } from "../store/useGame";
import { useSealed } from "../store/useSealed";

export async function refreshAllFromAuthState(): Promise<void> {
  const game = useGame.getState();
  await Promise.all([game.loadIdentity(), game.refreshDecks(), game.loadPlaymats(), useSealed.getState().loadRemoteConfig()]);
}
