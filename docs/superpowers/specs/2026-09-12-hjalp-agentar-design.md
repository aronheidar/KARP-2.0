# Þjónustuborðs-agentarnir — hönnun (12.9.2026)

Hjálparbeiðni á karp.is er afgreidd af **skipuriti agenta** með manneskjuna á eina
staðnum sem skiptir máli: samþykkinu.

```
notandi (/hjalp/-formið)
   │  póstur á hjalp@ EINS OG ÁÐUR (manneskjan sér alltaf allt)
   ▼
ÞJÓNUSTUFULLTRÚINN — worker, ódýrt módel (claude-haiku-4-5)
   │  stofnar ticket (D1: tickets) · sendir móttökusvar á notandann (merkt sjálfvirkt)
   │  flokkar: tæknilegt? → CTO   annars → manneskja (stoppar í 'mottekid')
   ▼  repository_dispatch 'ticket-cto'
CTO-AGENTINN — GitHub Actions (cto.yml), öflugt módel (claude-opus-5), allt repo-ið
   │  rannsakar (lesa/leita/keyra próf) · lágmarks-lagfæring · workflow-ið pushar grein ticket/<id>
   ▼  POST /api/ticket/tillaga
STJÓRNANDINN (manneskja) — póstur með greiningu, diffstat og JÁ/NEI-hlekkjum (HMAC, einnota)
   │  já → repository_dispatch 'ticket-merge'          nei → 'hafnad', ekkert gerist
   ▼
TICKET-MERGE (ticket-merge.yml) — prófin verða að ganga → merge í main → POST /api/ticket/lagad
   ▼
ÞJÓNUSTUFULLTRÚINN lokar hringnum — notandinn fær „málið þitt er leyst" (drög CTO, send EFTIR samþykki)
```

## Íhlutir

| Skrá | Hlutverk |
|---|---|
| `web/migrations/0015_tickets.sql` | tickets-taflan í D1 (`tengsl`) + lífsferils-stöður |
| `web/src/worker/tickets.mjs` | þjónustufulltrúinn + allir `/api/ticket/*` endapunktarnir |
| `web/src/lib/emails.mjs` | 5 ný sniðmát (`ticket_mottaka/_tillaga/_greint/_villa/_lagad`) — ritanleg í stjórnborði |
| `skriptur/cto_agent.mjs` | CTO-agentinn: handsmíðuð tool-lykkja (SDK), 7 verkfæri, harðir verðir |
| `.github/workflows/cto.yml` | keyrir agentinn, býr til grein, skilar tillögu |
| `.github/workflows/ticket-merge.yml` | samþykkt tillaga → próf → merge → lokasvar |
| próf | `web/test/tickets.test.mjs` + `skriptur/cto_agent.test.mjs` (verðirnir eru samningurinn) |

## Öryggislíkanið (það sem módelin fá EKKI að ákveða)

- **Leiðargátun í kóða:** Greiðslur & áskrift / Innskráning & aðgangur fara ALLTAF til manneskju
  (`leidGuard`) — ákvörðun módelsins er gátuð, ekki treyst.
- **Ekkert í main án manneskju:** CTO-agentinn kemst aðeins á `ticket/<id>`-grein; merge gerist
  eingöngu gegnum einnota HMAC-hlekk stjórnandans (bundinn ticket+aðgerð á `SESSION_SECRET`,
  einnota gegnum stöðuvél) og prófin verða að ganga fyrst.
- **Verkfæraverðir agentsins:** aðeins innan repo-rótar; `.github/`, `.git/`, lockfiles og `.env`
  friðhelg; aðeins node/npm án keðjutákna; env undirferla HREINSAÐ af öllum lyklum.
- **PII-lágmörkun:** nafn og netfang notandans fara aldrei inn í CTO-módelið; ticket-JSON fer í
  CI-skrá, ekki í logg. `/api/ticket/{gogn,tillaga,lagad}` auðkenna með `x-karp-lykill`.
- **Bilun öskrar:** hvert fall í cto.yml/ticket-merge.yml endar í `ticket_villa`-pósti á
  stjórnandann (lærdómurinn úr `|| true`-úttektinni C1) — og notandinn fær aldrei lokasvar
  nema merge hafi raunverulega tekist.
- **Heiðarleiki út á við:** móttökusvarið segir berum orðum að það komi frá sjálfvirkum
  þjónustufulltrúa; engin loforð um tíma eða niðurstöðu (sama regla og fréttavélin/spyrðu).

## Mjúk föll (ekkert brotnar þótt eitthvað vanti)

| Vantar | Hegðun |
|---|---|
| `ANTHROPIC_API_KEY` á worker / `TICKETS_OFF=1` | /api/hjalp hegðar sér NÁKVÆMLEGA eins og fyrir breytinguna |
| tickets-taflan (migration óhlaupin) | sama — intake fellur hljóðlega í gamla ferlið |
| `GITHUB_DISPATCH_TOKEN` | notandinn fær móttökusvar; málið stoppar í 'mottekid' hjá manneskju |
| AI-svar ónothæft | heiðarlegt sniðmátssvar (engin skáldskapur) og leiðin fellur á manneskju |

## Uppsetning (einu sinni)

1. **D1-migration:** `cd web && npx wrangler d1 execute tengsl --remote --file=migrations/0015_tickets.sql`
2. **Nýtt leyndarmál** (sama gildi á báðum stöðum): búa til t.d. `openssl rand -hex 32`
   - worker: `npx wrangler secret put KARP_TICKET_SECRET`
   - GitHub → Settings → Secrets → Actions: `KARP_TICKET_SECRET`
3. **Staðfesta að til séu:** worker-secrets `ANTHROPIC_API_KEY`, `GITHUB_DISPATCH_TOKEN`,
   `SESSION_SECRET`, `GMAIL_*` (öll í notkun í dag) · Actions-secret `ANTHROPIC_API_KEY`.
4. **Deploy á workernum** (venjulega leiðin) — flæðið virkjast sjálfkrafa við það.
5. **Prófun end-to-end:** senda beiðni á /hjalp/ með flokk „Villa í gögnum" og augljósri villu →
   fylgjast með: móttökupóstur → cto.yml í Actions → tillögupóstur → JÁ → ticket-merge → lokapóstur.
   Handvirk endurkeyrsla: Actions → „CTO-agent (ticket)" → Run workflow (ticket-númerið).

Ath. um gildistöku: merge í main er „málið leyst" gagnvart notandanum; breytingar á
worker/síðum taka gildi við næsta deploy (venjulega leiðin) og skriptu-/gagnabreytingar
við næstu gagnakeyrslu — CTO-agentinn á að orða notendasvarið án tímaloforða hvort eð er.

Valfrjálst: `KARP_FULLTRUI_MODEL` / `KARP_CTO_MODEL` / `KARP_CTO_SKREF` env til að skipta um módel/mörk.

## Meðvitað EKKI gert (fasi 2, ef þörf krefur)

- **Beinn tölvupóstur á hjalp@** (utan formsins) fer ekki sjálfkrafa í flæðið — krefst
  Gmail-lesheimildar (nýtt scope á refresh-token) eða Cloudflare Email Routing. Formið dekkar
  nær allt í dag og manneskjan sér beinu póstana hvort eð er.
- Svarþráður notanda (reply við móttökupósti) fer til manneskju, ekki aftur í AI — viljandi.
- Sjálfvirk lokun/áminningar á gömlum ticketum; stjórnborðs-síða yfir tickets. D1-taflan ber það
  þegar að (atburdir-annáll) þegar að því kemur.
