// Umboðs-stigagjöf. Full stig innan bands; línuleg rýrnun að zeroAt-fjarlægð utan bands; klippt [0,100].
import { MANDATE } from './game-config.mjs';

export function scoreKpi(value, spec) {
  let outside; // fjarlægð UTAN bands (0 ef innan)
  if (spec.dir === 'target') outside = Math.max(0, Math.abs(value - spec.target) - spec.band);
  else if (spec.dir === 'max') outside = Math.max(0, value - (spec.max + spec.band));
  else /* min */ outside = Math.max(0, (spec.min - spec.band) - value);
  if (outside <= 0) return 100;
  const span = spec.zeroAt; // fjarlægð frá band-jaðri þar sem stig = 0
  return Math.max(0, Math.round(100 * (1 - outside / span)));
}

export function scoreRound(kpis, mandate = MANDATE) {
  const perKpi = mandate.kpis.map((spec) => ({ key: spec.key, label: spec.label, value: kpis[spec.key], score: scoreKpi(kpis[spec.key], spec), weight: spec.weight || 1 }));
  const wsum = perKpi.reduce((a, p) => a + p.weight, 0);
  let composite = perKpi.reduce((a, p) => a + p.score * p.weight, 0) / (wsum || 1);
  const crisis = mandate.crisis.some((c) => kpis[c.key] > c.over);
  if (crisis) composite *= mandate.crisisFactor;
  return { perKpi, composite: Math.round(composite * 10) / 10, crisis };
}
