import { getStore } from "@netlify/blobs";

export default async (req) => {
  try{
    const store = getStore("forecast");
    const data = await store.get("latest", { type: "json" });
    if(!data){
      return new Response(JSON.stringify({ error: "ingen data endnu" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify(data), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=300",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }catch(e){
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
