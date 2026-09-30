export interface Env {
  GITHUB_REPORTS_TOKEN: string;
  /** Reused for report rate-limiting, user accounts, sessions, and synced account data — see auth.ts/sync.ts for key prefixes. */
  RATE_LIMIT_KV: KVNamespace;
}
