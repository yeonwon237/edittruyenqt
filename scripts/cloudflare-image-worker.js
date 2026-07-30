// Cloudflare Worker: free image-generation proxy for CreateVideo.jsx's cover
// generator (src/lib/videoCover.js). Not part of this app's own build/deploy
// — this file is deployed SEPARATELY on Cloudflare's own dashboard (paste
// into the Workers online editor, no CLI/Node needed). Exists purely to add
// CORS headers around Cloudflare Workers AI, since the raw management API
// (api.cloudflare.com) does not allow direct browser calls.
//
// Requires a "Workers AI" binding named AI (Settings → Bindings → Add →
// Workers AI, variable name "AI") on the deployed Worker.
export default {
  async fetch(request, env) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "Chỉ hỗ trợ POST" }), {
        status: 405,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    try {
      const body = await request.json();
      const prompt = (body?.prompt || "").toString().slice(0, 2048);
      if (!prompt.trim()) {
        return new Response(JSON.stringify({ error: "Thiếu prompt" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }
      // steps: more steps = better detail, capped at the model's own max (8)
      // to stay a single fast request and avoid burning the free daily
      // Neuron allowance faster than necessary.
      const steps = Math.min(Math.max(Number(body?.steps) || 8, 1), 8);

      const result = await env.AI.run("@cf/black-forest-labs/flux-1-schnell", {
        prompt,
        steps,
      });

      // result.image is already base64 — wrapping it as a data: URI means
      // the app never has to fetch a separate image URL (which is where
      // cross-origin/tainted-canvas problems come from), it just draws this
      // string directly.
      return new Response(JSON.stringify({ image: `data:image/jpeg;base64,${result.image}` }), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: err?.message || "Lỗi không rõ nguyên nhân" }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }
  },
};
