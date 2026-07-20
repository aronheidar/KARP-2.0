import ARCH from '@gogn/frettavel_archive.json';
import { asciiId } from '../../lib/frettavel.mjs';
import { chartSvg } from '../../lib/frettavel-export.mjs';

export function getStaticPaths() {
  const seen = new Set();
  return (ARCH.items || [])
    .filter((it) => { if (!chartSvg(it)) return false; const s = asciiId(it.id); if (!s || seen.has(s)) return false; seen.add(s); return true; })
    .map((it) => ({ params: { id: asciiId(it.id) }, props: { svg: chartSvg(it) } }));
}

export function GET({ props }) {
  return new Response(props.svg, { headers: { 'content-type': 'image/svg+xml; charset=utf-8' } });
}
