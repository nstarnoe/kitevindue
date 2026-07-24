// Henter DMI HARMONIE AROME (via Open-Meteo) for alle spots i data/spots.json
// og skriver resultatet til data/forecast.json. Køres af GitHub Actions.
import { readFile, writeFile } from "node:fs/promises";

const OM_BASE = "https://api.open-meteo.com/v1/forecast";
const FORECAST_DAYS = 7;

function toSteps(hourly){
  const out = [];
  const t = hourly.time || [];
  for(let i = 0; i < t.length; i++){
    out.push({
      t: t[i].length === 16 ? t[i] + ":00Z" : t[i],
      wind: hourly.wind_speed_10m ? hourly.wind_speed_10m[i] : null,
      gust: hourly.wind_gusts_10m ? hourly.wind_gusts_10m[i] : null,
      dir:  hourly.wind_direction_10m ? hourly.wind_direction_10m[i] : null,
      rain: hourly.precipitation ? hourly.precipitation[i] : null,
      ptype: null,
    });
  }
  return out;
}

async function main(){
  const library = JSON.parse(await readFile("data/spots.json", "utf8"));
  if(!Array.isArray(library) || !library.length){
    throw new Error("data/spots.json er tom eller ugyldig");
  }
  console.log(`Henter forecast for ${library.length} spots...`);

  const lats = library.map(s => s.lat).join(",");
  const lons = library.map(s => s.lon).join(",");
  const url = `${OM_BASE}?latitude=${lats}&longitude=${lons}`
            + `&hourly=wind_speed_10m,wind_direction_10m,wind_gusts_10m,precipitation`
            + `&models=dmi_harmonie_arome_europe`
            + `&wind_speed_unit=ms`
            + `&timeformat=iso8601&timezone=UTC`
            + `&forecast_days=${FORECAST_DAYS}`;

  const results = {};
  const errors = {};

  const r = await fetch(url);
  if(!r.ok){
    const body = await r.text();
    throw new Error(`Open-Meteo HTTP ${r.status}: ${body.slice(0,200)}`);
  }
  let data = await r.json();
  if(!Array.isArray(data)) data = [data];

  data.forEach((loc, idx) => {
    const spot = library[idx];
    if(!spot) return;
    const key = spot.lat.toFixed(4) + "," + spot.lon.toFixed(4);
    if(loc.hourly && loc.hourly.time){
      results[key] = {
        name: spot.name, lat: spot.lat, lon: spot.lon,
        shoreDir: spot.shoreDir ?? null,
        info: spot.info || null,
        steps: toSteps(loc.hourly),
      };
    }else{
      errors[key] = "ingen hourly-data";
    }
  });

  const payload = {
    updated: new Date().toISOString(),
    count: Object.keys(results).length,
    librarySize: library.length,
    errors,
    spots: results,
  };

  await writeFile("data/forecast.json", JSON.stringify(payload));
  console.log(`Færdig: ${payload.count}/${library.length} spots hentet.`);
  if(Object.keys(errors).length) console.log("Fejl:", errors);
}

main().catch(e => { console.error("FEJL:", e.message); process.exit(1); });
