# Kitevindue

Kitesurf-prognose for Sjælland. Data hentes via Open-Meteo (`api.open-meteo.com`)
og kombinerer to modeller pr. time, så vi får en hel uges prognose:

- **DMI HARMONIE DINI** (`dmi_harmonie_arome_europe`) — høj opløsning (2 km), men
  dækker kun ca. 2,5 dage. Bruges altid når den har data.
- **DWD ICON** (`icon_seamless`) — lavere opløsning, men dækker en hel uge. Fylder
  hullet ud efter DMI's 2,5 dage.

Hver time er mærket med hvilken model den stammer fra (`src: "dmi"` / `"icon"`),
og ICON-timer vises med en lilla farve/mærkat i appen, så det altid er tydeligt
hvilken del af ugen der er den mere præcise DMI-prognose.

Vi kalder ikke DMI's egen API (`opendataapi.dmi.dk`) direkte, da den rate-limiter
hårdt (~1 kald/sekund) og giver HTTP 429 ved gentagne opslag — særligt fra en browser
med flere spots. Open-Meteo håndterer det i ét batch-kald for alle spots, og med et
eksplicit `models=`-parameter (ikke "best_match") sammensplejser Open-Meteo ikke
modeller vi ikke selv har bedt om.

Alt kører gratis på GitHub — ingen server, ingen credits der løber tør.

## Sådan virker det

- **`data/spots.json`** — det fælles bibliotek af kitespots.
- **`.github/workflows/forecast.yml`** — GitHub Action der kører hver 3. time,
  henter vejrdata for alle spots og gemmer det i `data/forecast.json`.
- **`index.html`** — selve appen. Læser de to filer. Hostes på GitHub Pages.

## Opsætning (engangsopgave)

### 1. Gør repo'et offentligt
GitHub Pages kræver et offentligt repo på gratis-planen.
Settings → General → nederst "Change repository visibility" → Public.

### 2. Slå GitHub Pages til
Settings → Pages → under "Source" vælg **Deploy from a branch** →
Branch: `main`, mappe: `/ (root)` → Save.

Efter et minut ligger appen på:
`https://DIT-BRUGERNAVN.github.io/kitevindue/`

### 3. Kør henteren første gang
Actions-fanen → "Hent vejrprognose" → **Run workflow**.
Efter ~1 minut er `data/forecast.json` fyldt, og appen viser data.

Derefter kører den automatisk hver 3. time.

## Tilføj et spot til det fælles bibliotek

Rediger `data/spots.json` og tilføj en linje:

```json
{ "name": "Nyt spot", "lon": 12.3456, "lat": 55.6789, "shoreDir": 270 }
```

`shoreDir` er den retning vinden blæser FRA når den er off-shore
(N=0, Ø=90, S=180, V=270). Sæt `null` hvis du ikke vil have advarsel.

Commit. Ved næste kørsel (eller kør workflow manuelt) hentes data for spottet.

## Bemærk

Spots du tilføjer inde i appen gemmes kun lokalt på din egen enhed.
For at et spot bliver fælles skal det i `data/spots.json`.
