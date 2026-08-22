const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
});

const jobs = new Map();

function realGpuEnabled(env) {
  return env.ALLOW_REAL_GPU === "true" && Boolean(env.RUNPOD_API_KEY) && Boolean(env.RUNPOD_ENDPOINT_ID);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/health" && request.method === "GET") {
      const real = realGpuEnabled(env);
      return json({
        ok: true,
        mode: real ? "runpod" : "mock",
        version: env.APP_VERSION || "4.1",
        engine: "wan-2.2-ti2v-5b",
        real_gpu_allowed: real,
        message: real
          ? "Backend Cloudflare prêt. RunPod est configuré mais chaque génération doit encore être confirmée dans l’application."
          : "Backend Cloudflare actif en simulation 0 €. Aucun GPU réel n’est autorisé."
      });
    }

    if (url.pathname === "/api/v1/generate" && request.method === "POST") {
      let body;
      try { body = await request.json(); }
      catch { return json({ error: "JSON invalide" }, 400); }

      if (!body?.prompt || typeof body.prompt !== "string") {
        return json({ error: "prompt requis" }, 400);
      }

      if (realGpuEnabled(env)) {
        // Intentionally blocked in this bootstrap release. The RunPod adapter
        // will be enabled only after persistent job/video storage is bound.
        return json({
          error: "GPU réel verrouillé jusqu’au stockage persistant",
          code: "PERSISTENCE_REQUIRED"
        }, 409);
      }

      const id = `mock_${crypto.randomUUID()}`;
      jobs.set(id, { createdAt: Date.now() });
      return json({ job_id: id, status: "queued", mode: "mock", cost_eur: 0 }, 202);
    }

    const match = url.pathname.match(/^\/api\/v1\/jobs\/([^/]+)$/);
    if (match && request.method === "GET") {
      const id = decodeURIComponent(match[1]);
      const job = jobs.get(id);
      if (!job) return json({ error: "Tâche introuvable ou Worker redémarré" }, 404);
      const elapsed = Date.now() - job.createdAt;
      const progress = Math.min(100, Math.round(elapsed / 80));
      return json({
        id,
        status: elapsed >= 8000 ? "completed" : "processing",
        progress,
        mode: "mock",
        cost_eur: 0
      });
    }

    return env.ASSETS.fetch(request);
  }
};
