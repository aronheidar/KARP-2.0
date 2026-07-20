import ARCH from '@gogn/frettavel_archive.json';
import { asciiId } from '../../lib/frettavel.mjs';
import { hasExport, exportCsv } from '../../lib/frettavel-export.mjs';

export function getStaticPaths() {
  const seen = new Set();
  return (ARCH.items || [])
    .filter((it) => { if (!hasExport(it)) return false; const s = asciiId(it.id); if (!s || seen.has(s)) return false; seen.add(s); return true; })
    .map((it) => ({ params: { id: asciiId(it.id) }, props: { it } }));
}

export function GET({ props }) {
  return new Response(exportCsv(props.it), { headers: { 'content-type': 'text/csv; charset=utf-8' } });
}
