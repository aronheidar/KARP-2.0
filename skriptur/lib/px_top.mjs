// skriptur/lib/px_top.mjs — ver gegn gildru í PxWeb-síunni 'top'.
//
// 'top' velur N NÝJUSTU gildi TÍMABREYTU. Á breytu sem er EKKI merkt time:true velur hún fyrstu N
// gildin í geymsluröð. Í SKO04205 („Ár", 1995-1996 … 2024-2025) þýddi það að /menntun/ sýndi
// brautskráða 1995–1996 sem nýjustu tölur (fannst 21.9.2026). Hér er 'top' á ómerktri breytu skipt út
// fyrir 'item' með N nýjustu gildunum.

/** Skiptir 'top' á breytum sem eru ekki tímamerktar út fyrir 'item' með N nýjustu gildunum. */
export function leidrettaTop(query, meta) {
  const breytur = new Map((meta?.variables || []).map((v) => [v.code, v]));
  return query.map((q) => {
    if (q?.selection?.filter !== 'top') return q;
    const v = breytur.get(q.code);
    if (!v || v.time === true) return q;
    const n = Number(q.selection.values?.[0]) || 1;
    const gildi = [...v.values];
    // Ár og tímabil („2024", „2024-2025", „2024M06") raðast rétt sem strengir; geymsluröðin getur verið öfug.
    if (gildi.every((x) => /^\d{4}/.test(x))) gildi.sort();
    return { code: q.code, selection: { filter: 'item', values: gildi.slice(-n) } };
  });
}

/** Hvort fyrirspurn notar 'top' einhvers staðar (þá þarf lýsigögn töflunnar). */
export const hefurTop = (query) => query.some((q) => q?.selection?.filter === 'top');
