import ARCH from '@gogn/frettavel_archive.json';
import { asciiId } from '../../lib/frettavel.mjs';
import { hasExport, exportJson } from '../../lib/frettavel-export.mjs';

export function getStaticPaths() {
  const seen = new Set();
  return (ARCH.items || [])
    .filter((it) => { if (!hasExport(it)) return false; const s = asciiId(it.id); if (!s || seen.has(s)) return false; seen.add(s); return true; })
    .map((it) => ({ params: { id: asciiId(it.id) }, props: { it } }));
}

export function GET({ props }) {
  return new Response(JSON.stringify(exportJson(props.it), null, 2), { headers: { 'content-type': 'application/json; charset=utf-8' } });
}
