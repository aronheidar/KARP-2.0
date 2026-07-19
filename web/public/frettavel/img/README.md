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
| `sjavarutvegur.jpg` | Sjávarútvegur (kvóti) | *An Icelandic fishing trawler at sea or a harbor with fishing boats and crates of fish. Documentary daylight, no text, no faces.* |
| `annad.jpg` | Fallback (aðrar tegundir) | *Abstract Icelandic data/statistics imagery — charts over a subtle map of Iceland. Neutral, no text.* |

> Þegar þú hefur búið þær til, leggðu þær í þessa möppu (`web/public/frettavel/img/`) með réttum nöfnum og pushaðu — þær birtast sjálfkrafa.

## Fjölbreytni — fleiri afbrigði per flokk

Til að ekki birtist alltaf sama myndin á öllum fréttum sama flokks má bæta við **afbrigðum**: `<skrá>-2.jpg`, `<skrá>-3.jpg` … (sömu kröfur: 1200×630 JPG). Vélin skannar möppuna á byggingartíma og velur afbrigði **fast eftir frétt-id** — sama frétt fær alltaf sömu mynd, en ólíkar fréttir í flokknum dreifast á afbrigðin. Ef aðeins ein mynd er til er hún alltaf notuð (engin afturför).

### Sett 2 — `<skrá>-2.jpg` (önnur sena, sami flokkur)

| Skrá | Prompt (enska) |
|---|---|
| `althingi-2.jpg` | *Interior of the Icelandic parliament — rows of empty seats and desks, or the Alþingishúsið facade at dusk with lit windows. No people, no text.* |
| `kannanir-2.jpg` | *A hand placing a folded ballot into a box, or a polling-station sign and queue seen from behind. Muted, no faces, no text.* |
| `fasteignir-2.jpg` | *A "Til sölu" (for sale) sign outside an Icelandic house, or house keys on a floor plan. Neutral daylight, no text on signage.* |
| `markadir-2.jpg` | *Close-up of a candlestick trading chart on multiple monitors, cool blue tones. No logos, no text.* |
| `rikisgreidslur-2.jpg` | *A stack of coins beside a calculator and printed ledgers, or a treasury/ministry building facade. Neutral, no text.* |
| `utbod-2.jpg` | *Architectural blueprints and a hard hat on a table, or a road-construction site with machinery. Editorial, no faces, no text.* |
| `gjaldthrot-2.jpg` | *A "Lokað" (closed) sign on a shop door, or an empty retail storefront with bare shelves. Quiet, muted, no readable text.* |
| `vextir-2.jpg` | *Close-up of a percent sign, or a mortgage document with a calculator. Financial, neutral, no readable text.* |
| `verdbolga-2.jpg` | *A long supermarket receipt and coins, or close-up of price tags on shelves. Everyday documentary, no readable brand text.* |
| `styrkir-2.jpg` | *A film-set clapperboard, or a microscope in a research lab, or a trophy. Creative/science theme, no text.* |
| `vorumerki-2.jpg` | *A designer sketching a logo, or a registered-trademark ® symbol, minimal flat lay. Clean, no readable text.* |
| `ivilnun-2.jpg` | *A pen signing a contract (close-up), or official documents with a government seal. No faces, no readable text.* |
| `domsmal-2.jpg` | *Close-up of a wooden judge's gavel, or law books on a shelf, or courthouse steps. Serious, no people, no text.* |
| `afbrot-2.jpg` | *Close-up of police tape, or a patrol car parked at night with blurred blue lights. Documentary, no faces, no text.* |
| `vinnumarkadur-2.jpg` | *Construction workers on scaffolding, or a factory floor / busy office seen from afar (no identifiable faces). Neutral, no text.* |
| `sveitarstjorn-2.jpg` | *A council meeting room, or a Nordic town-hall building in daylight, or an aerial of an Icelandic village. Neutral, no text.* |
| `utanrikis-2.jpg` | *Flags on poles outside a building, or a passport and a globe. Diplomatic theme, no faces, no text.* |
| `lyf-2.jpg` | *A pharmacist's counter, or pills spilling from a bottle, or a prescription slip. Clinical, no readable brand text.* |
| `fjolmidlar-2.jpg` | *A microphone with press badges, or a newsroom with screens, or a printing press. Media theme, no readable headlines.* |
| `sjavarutvegur-2.jpg` | *Fishermen hauling nets on deck, or a fish market with crates of cod, or an Icelandic harbour at dawn. Documentary, no faces, no text.* |
| `annad-2.jpg` | *Abstract data visualization — a bar chart over a subtle map of Iceland, alternate angle. Neutral, no text.* |

## Sérstakar myndir fyrir bylgju-tegundir (7 nýir flokkar)

Þessar frétta-tegundir (Bylgja 1–3) lánuðu áður mynd frá öðrum flokki. Nú fá þær **sérstakan flokk** (eigin `img`-slug). Þar til myndin er komin sýnir vélin sjálfkrafa upprunalegu láns-myndina (engin afturför). Sömu tæknikröfur og að ofan (1200×630 JPG, hlutlaust, engin texti/andlit/lógó, íslenskt/norrænt yfirbragð, almenn flokka-mynd).

| Skrá | Flokkur (frétta-tegund) | Prompt (enska) |
|---|---|---|
| `graent.jpg` | 🔋 Grænar tölur (rafbílar/BEV) | *An electric-car charging station with a plug connected to a car, or a row of EVs at chargers in an Icelandic setting. Clean green-energy theme, soft daylight, no text, no faces, no readable logos.* |
| `leiga.jpg` | 🔑 Leiga (leiguverð) | *A rental-housing theme — an Icelandic apartment building with a "for rent" sign, or a set of keys handed over a lease document. Neutral daylight, no readable text on signage, no faces.* |
| `bygging.jpg` | 🏗️ Byggingarleyfi (atvinnuhúsnæði) | *A newly built commercial building — a modern storefront, restaurant or office facade with scaffolding. Editorial daylight, no readable signage, no faces, no logos.* |
| `sveitfe.jpg` | 🏛️ Sveitarfjármál (skuldir/íbúa) | *A municipal-finance theme — a Nordic town hall beside a calculator and ledgers, or coins stacked in front of a town hall. Neutral, no text, no faces.* |
| `gengi.jpg` | 💱 Gengi krónu | *Icelandic króna banknotes and coins beside a blurred currency-exchange board, or króna notes fanned out. Financial theme, no readable text, no faces.* |
| `ees.jpg` | 🇪🇺 Evrópusambandið / EES | *The European Union flag (ring of gold stars on blue) alongside the Icelandic flag, or an EU-stars motif over a document. Diplomatic/regulatory theme, no text, no faces.* |
| `samanburdur.jpg` | 🌍 Ísland í samhengi (Norðurlönd) | *A comparison theme — skylines of Nordic capitals side by side, or a world map with Reykjavík highlighted among Nordic cities. Neutral editorial, no text.* |

### Sett 2 — `<skrá>-2.jpg` (önnur sena, sami flokkur)

| Skrá | Prompt (enska) |
|---|---|
| `graent-2.jpg` | *Close-up of an EV charging cable and connector plugged into a car port, or wind turbines / geothermal steam behind a modern electric car. Green-energy theme, no text, no logos.* |
| `leiga-2.jpg` | *Interior of an empty rental apartment with bare walls and a window, or keys resting on a lease contract (close-up). Muted, editorial, no readable text, no faces.* |
| `bygging-2.jpg` | *Architectural blueprints and a hard hat on a table at a commercial building site, or a crane over a half-finished commercial building. No text, no faces.* |
| `sveitfe-2.jpg` | *An overhead view of an Icelandic town with budget documents and a calculator, or a piggy bank beside municipal accounts. Muted, no readable text.* |
| `gengi-2.jpg` | *Close-up of Icelandic króna coins with a faint rising/falling chart line, or a currency-exchange rate display with blurred numbers. Neutral, no logos.* |
| `ees-2.jpg` | *A row of European flags on poles outside a building, or the EU stars over a gavel/document (regulatory theme). Neutral, no readable text, no faces.* |
| `samanburdur-2.jpg` | *A shopping basket beside a price/currency comparison motif, or Reykjavík rooftops with an abstract index bar. Muted, no readable text.* |
