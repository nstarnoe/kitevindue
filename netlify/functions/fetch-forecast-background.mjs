import { getStore } from "@netlify/blobs";

const OM_BASE = "https://api.open-meteo.com/v1/forecast";
const FORECAST_DAYS = 3;

const JSONBIN = {
  BIN_ID: "6a6062d5da38895dfe7e0972",
  KEY: "$2a$10$Ev1Q3eCPAIJ.dFOkMH2H4.Ad0ZUqe1LNbw5Ccg5RlBIaBuhINwTZe",
};

const FALLBACK = [
  { name:"Gilleleje Havn", lon:12.3111, lat:56.1274, shoreDir:180 },
  { name:"Sølager",        lon:11.8994, lat:55.9466, shoreDir:90  },
  { name:"Nivå",           lon:12.5272, lat:55.9385, shoreDir:270 },
  { name:"Hornbæk",        lon:12.4469, lat:56.0931, shoreDir:180 },
  { name:"Lynæs",          lon:11.8626, lat:55.9441, shoreDir:90  },
  { name:"Amager Strandpark", lon:12.6441, lat:55.6504, shoreDir:270 },
  { name:"Køge Sydstrand", lon:12.1917, lat:55.4477, shoreDir:270 },
  { name:"Dalby Huse",     lon:11.9366, lat:55.8217, shoreDir:270 },
  { name:"Sanddopperne",   lon:11.3781, lat:55.7760, shoreDir:270 },
];

async function loadLibrary(){
  try{
    const r = await fetch("https://api.jsonbin.io/v3/b/"+JSONBIN.BIN_ID+"/latest",
      { headers: { "X-Access-Key": JSONBIN.KEY, "X-Bin-Meta": "false" } });
    if(!r.ok) throw new Error("HTTP "+r.status);
    const data = await r.json();
    const arr = Array.isArray(data) ? data : (data.spots || data.record || []);
    if(Array.isArray(arr) && arr.length) return arr;
  }catch(e){ }
  return FALLBACK;
}

function toSteps(hourly){
  const out = [];
  const t = hourly.time || [];
  for(let i=0; i<t.length; i++){
    out.push({
      t: t[i].length===16 ? t[i]+":00Z" : t[i],
      wind: hourly.wind_speed_10m ? hourly.wind_speed_10m[i] : null,
      gust: hourly.wind_gusts_10m ? hourly.wind_gusts_10m[i] : null,
      dir:  hourly.wind_direction_10m ? hourly.wind_direction_10m[i] : null,
      rain: hourly.precipitation ? hourly.precipitation[i] : null,
      ptype: null,
    });
  }
  return out;
}

export default async (req) => {
  const LIBRARY = await loadLibrary();

  const lats = LIBRARY.map(s => s.lat).join(",");
  const lons = LIBRARY.map(s => s.lon).join(",");
  const url = `${OM_BASE}?latitude=${lats}&longitude=${lons}`
            + `&hourly=wind_speed_10m,wind_direction_10m,wind_gusts_10m,precipitation`
            + `&models=dmi_harmonie_arome_europe`
            + `&wind_speed_unit=ms`
            + `&timeformat=iso8601&timezone=UTC`
            + `&forecast_days=${FORECAST_DAYS}`;

  const results = {};
  const errors = {};
  try{
    const r = await fetch(url);
    if(!r.ok) throw new Error("Open-Meteo HTTP "+r.status);
    let data = await r.json();
    if(!Array.isArray(data)) data = [data];
    data.forEach((loc, idx) => {
      const spot = LIBRARY[idx];
      if(!spot) return;
      const key = spot.lat.toFixed(4)+","+spot.lon.toFixed(4);
      if(loc.hourly && loc.hourly.time){
        results[key] = { name: spot.name, lat: spot.lat, lon: spot.lon,
                         shoreDir: spot.shoreDir, steps: toSteps(loc.hourly) };
      }else{
        errors[key] = "ingen hourly-data";
      }
    });
  }catch(e){
    errors["_all"] = e.message;
  }

  const payload = {
    updated: new Date().toISOString(),
    count: Object.keys(results).length,
    librarySize: LIBRARY.length,
    errors,
    spots: results,
  };

  const store = getStore("forecast");
  await store.setJSON("latest", payload);
  return new Response("ok");
};

export const config = {
  schedule: "50 0,3,6,9,12,15,18,21 * * *",
};
