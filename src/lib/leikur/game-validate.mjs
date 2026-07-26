// Hörð staðfesting á sérsniðnu leik-config. HREINT (engin env/D1/vél).
export function validateGameConfig({ scenario, mandate, rounds }, baseline) {
  const errors = [];
  const LEV = new Set(Object.keys(baseline.levers)), SHK = new Set(Object.keys(baseline.shocks)), OUT = new Set(Object.keys(baseline.outcomes));
  const R = Number(rounds);
  if (!Number.isInteger(R) || R < 1 || R > 20) errors.push('Umferðir verða að vera heiltala 1–20');
  if (!scenario || !Array.isArray(scenario.events)) { errors.push('Sviðsmynd (events) vantar'); }
  else {
    if (scenario.events.length !== R) errors.push('Fjöldi atburða (' + scenario.events.length + ') verður að vera = umferðir (' + R + ')');
    scenario.events.forEach((e, i) => {
      const rn = 'Umferð ' + (i + 1);
      if (typeof e.title !== 'string' || !e.title.trim()) errors.push(rn + ': titil vantar');
      for (const k of Object.keys(e.shocks || {})) { if (!SHK.has(k)) errors.push(rn + ': ógilt sjokk „' + k + '"'); else if (typeof e.shocks[k] !== 'number') errors.push(rn + ': sjokk „' + k + '" verður tala'); }
      if (!Array.isArray(e.responses) || e.responses.length < 1) { errors.push(rn + ': a.m.k. eitt viðbragð'); return; }
      const rkeys = [];
      e.responses.forEach((r, j) => {
        const vn = rn + ' viðbragð ' + (j + 1);
        if (typeof r.label !== 'string' || !r.label.trim()) errors.push(vn + ': heiti vantar');
        if (typeof r.key !== 'string' || !r.key) errors.push(vn + ': lykill vantar'); else rkeys.push(r.key);
        const eff = r.effect || {};
        for (const k of Object.keys(eff.lever || {})) { if (!LEV.has(k)) errors.push(vn + ': ógildur sleði „' + k + '"'); else if (typeof eff.lever[k] !== 'number') errors.push(vn + ': sleða-gildi verður tala'); }
        for (const k of Object.keys(eff.shock || {})) { if (!SHK.has(k)) errors.push(vn + ': ógilt sjokk „' + k + '"'); else if (typeof eff.shock[k] !== 'number') errors.push(vn + ': sjokk-gildi verður tala'); }
      });
      if (new Set(rkeys).size !== rkeys.length) errors.push(rn + ': viðbragðs-lyklar verða einstakir');
    });
  }
  if (!mandate || !Array.isArray(mandate.kpis) || !mandate.kpis.length) errors.push('Umboð (kpis) vantar');
  else mandate.kpis.forEach((k) => {
    if (!OUT.has(k.key)) errors.push('Umboð: ógild útkoma „' + k.key + '"');
    if (!['target', 'max', 'min'].includes(k.dir)) errors.push('Umboð „' + k.key + '": dir verður target/max/min');
    if (typeof k.band !== 'number' || k.band < 0) errors.push('Umboð „' + k.key + '": band ≥ 0');
    if (typeof k.zeroAt !== 'number' || k.zeroAt <= 0) errors.push('Umboð „' + k.key + '": zeroAt > 0');
    const tv = k.dir === 'target' ? k.target : k.dir === 'max' ? k.max : k.min;
    if (typeof tv !== 'number') errors.push('Umboð „' + k.key + '": markmiðs-gildi vantar');
  });
  return { ok: errors.length === 0, errors };
}
