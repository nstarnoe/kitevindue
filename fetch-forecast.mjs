// Henter DMI HARMONIE DINI-prognose DIREKTE fra DMI's Open Data API (opendataapi.dmi.dk)
// for alle spots i data/spots.json og skriver resultatet til data/forecast.json.
// Køres af GitHub Actions. Ingen API-nøgle krævet.
import { readFile, writeFile } from "node:fs/promises";

const DMI_BASE = "https://opendataapi.dmi.dk/v1/forecastedr/collections/harmonie_dini_sf/position";
const PARAMS = ["wind-speed-10m", "wind-dir-10m", "gust-wind-speed-10m", "total-precipitation"];
// DMI's Open Data API tillader ca. 1 kald i sekundet. Vi holder god afstand mellem spots.
const REQUEST_DELAY_MS = 1200;
const MAX_RETRIES = 3;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// DMI's total-precipitation er akkumuleret siden prognosens start,
// så vi differencer nabo-trin for at få mm pr. time.
function toSteps(features) {
  const rows = features
    .map((f) => ({ t: f.properties.step, ...f.properties }))
    .filter((r) => !!r.t)
    .sort((a, b) => a.t.localeCompare(b.t));

  let prevPrecip = null;
  return rows.map((r) => {
    const precipRaw = r["total-precipitation"];
    let rain = null;
    if (precipRaw != null) {
      rain = prevPrecip == null ? 0 : Math.max(0, +(precipRaw - prevPrecip).toFixed(2));
      prevPrecip = precipRaw;
    }
    return {
      t: r.t.length === 16 ? r.t + ":00Z" : r.t,
      wind: r["wind-speed-10m"] ?? null,
      gust: r["gust-wind-speed-10m"] ?? null,
      dir: r["wind-dir-10m"] ?? null,
      rain,
      ptype: null,
    };
  });
}

async function fetchSpotOnce(spot) {
  const url =
    `${DMI_BASE}?coords=POINT(${spot.lon} ${spot.lat})&crs=crs84` +
    `&parameter-name=${PARAMS.join(",")}&f=GeoJSON`;
  const r = await fetch(url);
  if (!r.ok) {
    const body = await r.text();
    throw new Error(`DMI HTTP ${r.status}: ${body.slice(0, 200)}`);
  }
  const data = await r.json();
  if (!data.features || !data.features.length) {
    throw new Error("DMI svarede uden features (tomt datasæt for dette punkt)");
  }
  return toSteps(data.features);
}

async function fetchSpot(spot) {
  let lastErr;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fetchSpotOnce(spot);
    } catch (e) {
      lastErr = e;
      // 429 = for mange kald; vent lidt længere og prøv igen
      const wait = attempt * 1500;
      console.log(`    forsøg ${attempt}/${MAX_RETRIES} fejlede (${e.message}), venter ${wait}ms...`);
      await sleep(wait);
    }
  }
  throw lastErr;
}

async function main() {
  const library = JSON.parse(await readFile("data/spots.json", "utf8"));
  if (!Array.isArray(library) || !library.length) {
    throw new Error("data/spots.json er tom eller ugyldig");
  }
  console.log(`Henter forecast for ${library.length} spots direkte fra DMI (harmonie_dini_sf)...`);

  const results = {};
  const errors = {};

  for (const spot of library) {
    const key = spot.lat.toFixed(4) + "," + spot.lon.toFixed(4);
    try {
      const steps = await fetchSpot(spot);
      results[key] = {
        name: spot.name,
        lat: spot.lat,
        lon: spot.lon,
        shoreDir: spot.shoreDir ?? null,
        info: spot.info || null,
        steps,
      };
      console.log(`  ✓ ${spot.name} — ${steps.length} timer hentet`);
    } catch (e) {
      errors[key] = e.message;
      console.log(`  ✗ ${spot.name}: ${e.message}`);
    }
    await sleep(REQUEST_DELAY_MS);
  }

  const payload = {
    updated: new Date().toISOString(),
    source: "dmi-opendataapi/harmonie_dini_sf",
    count: Object.keys(results).length,
    librarySize: library.length,
    errors,
    spots: results,
  };

  await writeFile("data/forecast.json", JSON.stringify(payload));
  console.log(`Færdig: ${payload.count}/${library.length} spots hentet fra DMI.`);
  if (Object.keys(errors).length) console.log("Fejl:", errors);
}

main().catch((e) => {
  console.error("FEJL:", e.message);
  process.exit(1);
});
