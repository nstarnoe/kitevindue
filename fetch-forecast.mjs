// Henter vindprognose for alle spots i data/spots.json via Open-Meteo og skriver
// resultatet til data/forecast.json. Køres af GitHub Actions.
//
// To modeller kombineres pr. time:
//   - dmi_harmonie_arome_europe (DMI HARMONIE DINI) — foretrukket, men dækker kun ~2,5 dage
//   - icon_seamless (DWD ICON)                       — bruges til resten af ugen
// Hver time mærkes med "src":"dmi" eller "src":"icon", så UI'et kan vise dem forskelligt.
import { readFile, writeFile } from "node:fs/promises";

const OM_BASE = "https://api.open-meteo.com/v1/forecast";
const FORECAST_DAYS = 7;
const MODELS = "dmi_harmonie_arome_europe,icon_seamless";
const DMI_SUFFIX = "_dmi_harmonie_arome_europe";
const ICON_SUFFIX = "_icon_seamless";

function toSteps(hourly){
  const out = [];
  const t = hourly.time || [];
  for(let i = 0; i < t.length; i++){
    const dmiWind = hourly["wind_speed_10m"+DMI_SUFFIX] ? hourly["wind_speed_10m"+DMI_SUFFIX][i] : null;
    const iconWind = hourly["wind_speed_10m"+ICON_SUFFIX] ? hourly["wind_speed_10m"+ICON_SUFFIX][i] : null;
    let src, suffix;
    if(dmiWind != null){ src="dmi"; suffix=DMI_SUFFIX; }
    else if(iconWind != null){ src="icon"; suffix=ICON_SUFFIX; }
    else continue; // ingen af modellerne har data for denne time
    const wind = hourly["wind_speed_10m"+suffix] ? hourly["wind_speed_10m"+suffix][i] : null;
    if(wind == null) continue;
    out.push({
      t: t[i].length === 16 ? t[i] + ":00Z" : t[i],
      wind,
      gust: hourly["wind_gusts_10m"+suffix] ? hourly["wind_gusts_10m"+suffix][i] : null,
      dir:  hourly["wind_direction_10m"+suffix] ? hourly["wind_direction_10m"+suffix][i] : null,
      rain: hourly["precipitation"+suffix] ? hourly["precipitation"+suffix][i] : null,
      ptype: null,
      src, // 'dmi' (høj opløsning, ~2,5 dage) eller 'icon' (resten af ugen)
    });
  }
  return out;
}

async function main(){
  const library = JSON.parse(await readFile("data/spots.json", "utf8"));
  if(!Array.isArray(library) || !library.length){
    throw new Error("data/spots.json er tom eller ugyldig");
  }
  console.log(`Henter forecast for ${library.length} spots (DMI + ICON via Open-Meteo)...`);

  const lats = library.map(s => s.lat).join(",");
  const lons = library.map(s => s.lon).join(",");
  const url = `${OM_BASE}?latitude=${lats}&longitude=${lons}`
            + `&hourly=wind_speed_10m,wind_direction_10m,wind_gusts_10m,precipitation`
            + `&models=${MODELS}`
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
      const steps = toSteps(loc.hourly);
      if(!steps.length){
        errors[key] = "ingen data fra DMI eller ICON for dette punkt";
        return;
      }
      const dmiHours = steps.filter(s => s.src === "dmi").length;
      results[key] = {
        name: spot.name, lat: spot.lat, lon: spot.lon,
        shoreDir: spot.shoreDir ?? null,
        info: spot.info || null,
        steps,
      };
      console.log(`  ✓ ${spot.name} — ${steps.length} timer (${dmiHours} DMI, ${steps.length-dmiHours} ICON)`);
    }else{
      errors[key] = "ingen hourly-data";
    }
  });

  const payload = {
    updated: new Date().toISOString(),
    source: "open-meteo/dmi_harmonie_arome_europe+icon_seamless",
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
