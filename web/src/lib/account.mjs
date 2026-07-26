// account.mjs — hrein firma-account resolver (engin I/O; einingaprófuð). Sjá spec 2026-07-26.
import { TIER_LVL } from '../data/lausnir.js';

export const accountId = (u) => (u && (u.parent_account_id || u.id)) || null;

const _activeTier = (r, now) => (r && r.tier && r.tier_until && r.tier_until > now) ? r.tier : null;
const _lvl = (t) => (t && TIER_LVL[t]) || 0;

// tier = eigin virkt þrep; effectiveTier = hærra virkt þrep af eigin (ownRow) og account (ownerRow).
export function tierFields(ownRow, ownerRow, now) {
  const own = _activeTier(ownRow, now);
  const acct = _activeTier(ownerRow, now);
  const effectiveTier = _lvl(acct) >= _lvl(own) ? acct : own;
  return { tier: own, effectiveTier: effectiveTier || null };
}
