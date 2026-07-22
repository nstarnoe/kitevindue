import { getStore } from "@netlify/blobs";

const DMI_BASE = "https://opendataapi.dmi.dk/v1/forecastedr/collections/harmonie_dini_sf/position";
const PARAMS = ["wind-speed-10m","wind-dir-10m","gust-wind-speed-10m","total-precipitation","precipitation-type"];
const WEEK_HOURS = 144;

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
  const now = new Date(), end = new Date(now.getTime() + WEEK_HOURS*3600*1000);
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
      t: p.step,
      wind: p["wind-speed-10m"],
      gust: p["gust-wind-speed-10m"],
      dir: p["wind-dir-10m"],
      rain,
      ptype: p["precipitation-type"],
    };
  });
}

async function fetchWithRetry(spot, results, errors){
  const key = spot.lat.toFixed(4)+","+spot.lon.toFixed(4);
  for(let attempt=0; attempt<4; attempt++){
    try{
      const steps = await fetchSpot(spot);
      results[key] = { name: spot.name, lat: spot.lat, lon: spot.lon,
                       shoreDir: spot.shoreDir, steps };
      return;
    }catch(e){
      if(String(e.message).includes("429") && attempt<3){ await sleep(1500*(attempt+1)); continue; }
      errors[key] = e.message;
      return;
    }
  }
}

export default async (req) => {
  const results = {};
  const errors = {};
  const BATCH = 2;
  for(let i=0; i<LIBRARY.length; i+=BATCH){
    const batch = LIBRARY.slice(i, i+BATCH);
    await Promise.all(batch.map(spot => fetchWithRetry(spot, results, errors)));
    if(i+BATCH < LIBRARY.length) await sleep(1200);
  }

  const payload = {
    updated: new Date().toISOString(),
    count: Object.keys(results).length,
    errors,
    spots: results,
  };

  const store = getStore("forecast");
  await store.setJSON("latest", payload);

  return new Response(JSON.stringify({ ok:true, count:payload.count, errors }), {
    headers: { "Content-Type": "application/json" },
  });
};

export const config = {
  schedule: "50 0,3,6,9,12,15,18,21 * * *",
};
