import { getStore } from "@netlify/blobs";

const DMI_BASE = "https://opendataapi.dmi.dk/v1/forecastedr/collections/harmonie_dini_sf/position";
const PARAMS = ["wind-speed-10m","wind-dir-10m","gust-wind-speed-10m","total-precipitation","precipitation-type"];
const HOURS_AHEAD = 84;

const LIBRARY = [
  { name:"Gilleleje Havn", lon:12.3111, lat:56.1274, shoreDir:180 },
  { name:"Sølager",        lon:11.8994, lat:55.9466, shoreDir:90  },
  { name:"Nivå",           lon:12.5272, lat:55.9385, shoreDir:270 },
  { name:"Hornbæk",        lon:12.4469, lat:56.0931, shoreDir:180 },
  { name:"Lynæs",          lon:11.8626, lat:55.9441, shoreDir:90  },
  { name:"Amager Strandpark", lon:12.6441, lat:55.6504, shoreDir:270 },
  { name:"Køge Sydstrand", lon:12.1917, lat:55.4477, shoreDir:270 },
  { name:"Dalby Huse",     lon:11.9330, lat:55.8890, shoreDir:270 },
];

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function fetchSpot(spot){
  const now = new Date(), end = new Date(now.getTime() + HOURS_AHEAD*3600*1000);
  const dt = now.toISOString().split('.')[0]+"Z/"+end.toISOString().split('.')[0]+"Z";
  const url = `${DMI_BASE}?coords=POINT(${spot.lon} ${spot.lat})&parameter-name=${PARAMS.join(',')}`
            + `&crs=crs84&f=GeoJSON&datetime=${encodeURIComponent(dt)}`;
  const r = await fetch(url);
  if(!r.ok) throw new Error("HTTP "+r.status);
  const data = await r.json();
  let prev = null;
  return (data.features||[]).map(f => {
    const p = f.properties, acc = p["total-precipitation"];
    let rain = null;
    if(acc != null){ rain = prev==null ? 0 : Math.max(acc-prev, 0); prev = acc; }
    return {
      t: p.step, wind: p["wind-speed-10m"], gust: p["gust-wind-speed-10m"],
      dir: p["wind-dir-10m"], rain, ptype: p["precipitation-type"],
    };
  });
}

export default async (req) => {
  const store = getStore("forecast");
  let existing = {};
  try{ const prev = await store.get("latest", { type:"json" }); if(prev && prev.spots) existing = prev.spots; }catch(e){}

  const results = { ...existing };
  const errors = {};
  for(const spot of LIBRARY){
    const key = spot.lat.toFixed(4)+","+spot.lon.toFixed(4);
    let ok = false;
    for(let attempt=0; attempt<6 && !ok; attempt++){
      try{
        const steps = await fetchSpot(spot);
        results[key] = { name: spot.name, lat: spot.lat, lon: spot.lon,
                         shoreDir: spot.shoreDir, steps };
        delete errors[key];
        ok = true;
      }catch(e){
        if(String(e.message).includes("429")){ await sleep(5000*(attempt+1)); }
        else { errors[key] = e.message; break; }
      }
    }
    if(!ok && !errors[key]) errors[key] = "429 efter flere forsøg";
    await store.setJSON("latest", {
      updated: new Date().toISOString(),
      count: Object.keys(results).length,
      errors, spots: results,
    });
    await sleep(4000);
  }

  return new Response("ok");
};

export const config = {
  schedule: "50 0,3,6,9,12,15,18,21 * * *",
};
