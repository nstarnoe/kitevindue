# Kitevindue — serverside opsætning

Denne version henter DMI-data **én gang centralt** (på en tidsplan) og
lader alle brugere trække den færdige data. Ingen bruger kalder DMI
direkte, så I rammer aldrig rate-grænsen (429), uanset hvor mange I er.

Serveren opdaterer automatisk hver 3. time, ca. 50 min efter DMI's
modelkørsler (00:50, 03:50, ... 21:50 UTC).

---

## Hvad du skal gøre (engangsopgave, ~10-15 min)

Fordi scheduled functions ikke kan drag-and-droppes, skal siden kobles
til et GitHub-repo. Bagefter deployer Netlify automatisk hver gang du
ændrer noget på GitHub.

### 1. Lav et GitHub-repo
- Opret en gratis konto på https://github.com hvis du ikke har en.
- Klik "New repository", giv det et navn (fx `kitevindue`), vælg Private,
  og opret det.

### 2. Læg filerne op
Den nemmeste vej fra iPad/browser:
- På repo-siden: "uploading an existing file".
- Upload HELE mappestrukturen fra denne pakke:
  - `netlify.toml`
  - `package.json`
  - `netlify/functions/fetch-forecast.mjs`
  - `netlify/functions/forecast.mjs`
  - `public/index.html`
- Vigtigt: behold mappestrukturen (netlify/functions/... og public/...).
  GitHubs upload lader dig skrive stien i filnavnet, fx
  `netlify/functions/forecast.mjs`.
- Commit.

### 3. Forbind Netlify til repo'et
- Log ind på https://app.netlify.com
- "Add new site" → "Import an existing project" → GitHub.
- Vælg dit `kitevindue`-repo.
- Netlify læser selv `netlify.toml`. Byggeindstillinger:
  - Publish directory: `public` (udfyldes automatisk fra toml).
  - Build command: (lad stå tom).
- Klik "Deploy".

### 4. Første datahentning
Scheduled functions kører først ved næste planlagte tidspunkt. For at få
data med det samme, kald din henter manuelt én gang:
- Åbn i browseren: `https://DIT-SITE.netlify.app/api/refresh`
- Vent til den svarer med `{"ok":true,"count":8,...}`.
- Nu ligger data klar. Åbn `https://DIT-SITE.netlify.app` — appen viser spots.

Færdig. Fra nu af opdaterer serveren selv hver 3. time.

---

## Sådan ændrer du noget bagefter
- Ret filen på GitHub (fx tilføj et spot i `LIBRARY` i
  `netlify/functions/fetch-forecast.mjs` OG i appens bibliotek).
- Commit. Netlify deployer automatisk i løbet af et minut.

## Tilføj spots til det fælles bibliotek
Serverens spot-liste ligger i `fetch-forecast.mjs` under `LIBRARY`.
Tilføj nye spots der (navn, lon, lat, shoreDir), commit, og de kommer
med ved næste hentning. Kald `/api/refresh` for at hente straks.

---

## Hvordan det hænger sammen
- `fetch-forecast.mjs` — kører på tidsplan, henter DMI for alle spots,
  gemmer i Netlify Blobs.
- `forecast.mjs` — serverer den gemte data på `/api/forecast`.
- `public/index.html` — appen; henter `/api/forecast` i ét kald.

## Gratis-grænser
Netlify gratis: 125.000 funktionskald/md + scheduled functions inkluderet.
Med 8 kørsler/dag + brugeres opslag er der rigeligt til en stor gruppe.
Netlify Blobs er også inkluderet i gratis-niveauet.
