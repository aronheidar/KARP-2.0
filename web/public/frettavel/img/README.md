# Flokka-myndir Fréttavélarinnar

Endurnýttar **eftir frétta-tegund** (ekki per frétt). Notaðar á fréttakortum, sér-fréttasíðum og sem OG-mynd við deilingu.

## Tæknilegar kröfur
- **Skráarnafn:** nákvæmlega eins og hér að neðan, allt lágstafir, endar á `.jpg`
- **Stærð:** 1200 × 630 px (OG-hlutföll; birtist líka klippt í 1200×500 hero + 104×80 smámynd)
- **Snið:** JPG, gæði ~80, helst < 250 KB
- **Stíll:** ritstjórnarleg ljósmynd / myndskreyting — **hlutlaus**, engin texti, engin þekkjanleg andlit eða vörumerki/lógó, mjúk náttúruleg birta, íslenskt/norrænt yfirbragð þar sem við á. **Almenn flokka-mynd, EKKI af tilteknum atburði** (svo hún sé aldrei villandi).
- Síðan sýnir mjúkt fallback (litaður halli + emoji) þar til mynd er komin — engin bið, bættu myndum við þegar hentar.

## Myndir (20) — skráarnafn → prompt

| Skrá | Flokkar sem nota | Prompt (á ensku fyrir myndlíkön) |
|---|---|---|
| `althingi.jpg` | Þing (atkvæði, ræður, fjarvistir, ráðherrar…) | *Editorial photo of the Icelandic parliament building (Alþingishúsið) exterior in Reykjavík, or an empty parliamentary chamber with a vacant speaker's podium. Documentary style, soft daylight, no people, no text.* |
| `kannanir.jpg` | Kannanir, stjórnarfylgi | *A ballot box and paper ballot on a table, or an abstract bar chart on a screen. Clean editorial style, muted colors, no text, no faces.* |
| `fasteignir.jpg` | Fasteignamet | *Aerial-ish view of Reykjavík residential rooftops and apartment blocks in daylight. Neutral documentary style, no text.* |
| `markadir.jpg` | Kauphöllin | *Abstract stock-market line charts glowing on a dark screen / financial trading imagery. Moody, no text, no logos.* |
| `rikisgreidslur.jpg` | Greiðslufrávik ríkisins | *Icelandic banknotes and coins beside printed invoices on a desk. Neutral top-down, soft light, no text.* |
| `utbod.jpg` | Útboð, útboðsniðurstöður | *Construction cranes and a building site at dusk, or a contract being signed. Editorial, no faces, no text.* |
| `gjaldthrot.jpg` | Gjaldþrot | *An empty, dimly lit office space with chairs stacked / a closed business, lights off. Quiet, muted, no text.* |
| `vextir.jpg` | Stýrivextir | *Exterior of the Central Bank of Iceland (Seðlabanki) building, or minimal percent-sign financial imagery. Neutral, no text.* |
| `verdbolga.jpg` | Verðbólga | *A grocery shopping basket in a supermarket aisle with price tags on shelves. Everyday documentary style, no text, no faces.* |
| `styrkir.jpg` | Styrkir | *A film camera on set beside a laboratory / an award envelope with cash — creative-and-science grant theme. Neutral, no text.* |
| `vorumerki.jpg` | Vörumerki | *A rubber stamp and a trademark/patent document, or minimal creative-design flat lay. Clean, no readable text.* |
| `ivilnun.jpg` | Ívilnanir | *A handshake over a desk with an official stamped document. Corporate-government theme, no faces, no text.* |
| `domsmal.jpg` | Dómsmál | *A courthouse interior, scales of justice and a judge's gavel on a bench. Serious, neutral, no people, no text.* |
| `afbrot.jpg` | Afbrot | *A police car with blue lights at night, or police tape. Documentary, no faces, no text.* |
| `vinnumarkadur.jpg` | Vinnumarkaður | *Workers/tradespeople at a job site or a busy office, seen from behind/afar (no identifiable faces). Neutral daylight, no text.* |
| `sveitarstjorn.jpg` | Sveitarstjórn | *A municipal town hall building exterior / an empty council chamber. Nordic architecture, neutral, no text.* |
| `utanrikis.jpg` | Utanríkis (sendiherrar) | *The Icelandic flag alongside foreign flags, or an embassy building. Diplomatic theme, no faces, no text.* |
| `lyf.jpg` | Lyfjaskortur | *Pharmacy shelves with medicine boxes / pill bottles. Clinical, neutral, no readable brand text.* |
| `fjolmidlar.jpg` | Umfjöllun (tónn) | *Stacked newspapers and news screens. Media theme, muted, no readable headlines.* |
| `annad.jpg` | Fallback (aðrar tegundir) | *Abstract Icelandic data/statistics imagery — charts over a subtle map of Iceland. Neutral, no text.* |

> Þegar þú hefur búið þær til, leggðu þær í þessa möppu (`web/public/frettavel/img/`) með réttum nöfnum og pushaðu — þær birtast sjálfkrafa.
