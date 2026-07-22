/**
 * GitHub sends x-ratelimit-limit / x-ratelimit-remaining / x-ratelimit-reset
 * headers on every REST API response. This module captures those from
 * whichever request happened most recently and lets the UI show current
 * usage, since several features in this app (clone, cherry-pick, folder
 * rename, workflow detection) can burn through a meaningful chunk of the
 * quota in a single user action.
 *
 * This is deliberately a plain module-level store, not Context - it's
 * updated from inside github.js's request helpers, which are called far
 * outside of any component tree, so a subscribable plain store is a
 * better fit than trying to thread this through React state at the
 * point of the fetch call.
 */

let state = {
  limit: null,
  remaining: null,
  resetAt: null, // Date | null
  resource: null, // 'core' | 'graphql' | 'search' | etc, from x-ratelimit-resource
  updatedAt: null,
};

const listeners = new Set();

export function captureRateLimitHeaders(headers) {
  const limit = headers.get('x-ratelimit-limit');
  const remaining = headers.get('x-ratelimit-remaining');
  const reset = headers.get('x-ratelimit-reset');
  const resource = headers.get('x-ratelimit-resource');

  if (limit == null && remaining == null) return;

  state = {
    limit: limit != null ? parseInt(limit, 10) : state.limit,
    remaining: remaining != null ? parseInt(remaining, 10) : state.remaining,
    resetAt: reset != null ? new Date(parseInt(reset, 10) * 1000) : state.resetAt,
    resource: resource || state.resource,
    updatedAt: Date.now(),
  };

  listeners.forEach((fn) => fn(state));
}

export function getRateLimitState() {
  return state;
}

export function subscribeToRateLimit(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * Convenience helper for UI warning thresholds: true once remaining
 * usage drops to 10% or less of the limit (matching GitHub's own
 * dashboard convention for flagging low quota).
 */
export function isRateLimitLow() {
  if (state.limit == null || state.remaining == null) return false;
  return state.remaining <= state.limit * 0.1;
}
