const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
});

function realGpuEnabled(env) {
  return env.ALLOW_REAL_GPU === "true" && Boolean(env.RUNPOD_API_KEY) && Boolean(env.RUNPOD_ENDPOINT_ID);
}

function persistenceReady(env) {
  return Boolean(env.DB) && Boolean(env.VIDEOS);
}

async function createMockJob(env, input) {
  const id = `mock_${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  await env.DB.prepare(`
    INSERT INTO video_jobs
      (id, project_id, title, mode, format, duration, engine, status, progress, cost_eur, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'processing', 5, 0, ?, ?)
  `).bind(
    id,
    input.project_id || null,
    input.title || null,
    input.mode || "Brouillon",
    input.format || "9:16",
    input.duration || "5 s",
    "wan-2.2-ti2v-5b",
    now,
    now
  ).run();
  return id;
}

async function readJob(env, id) {
  const job = await env.DB.prepare("SELECT * FROM video_jobs WHERE id = ?").bind(id).first();
  if (!job) return null;

  if (job.id.startsWith("mock_") && job.status === "processing") {
    const elapsed = Date.now() - Date.parse(job.created_at);
    const progress = Math.min(100, Math.max(5, Math.round(elapsed / 80)));
    const status = elapsed >= 8000 ? "completed" : "processing";
    if (progress !== job.progress || status !== job.status) {
      const now = new Date().toISOString();
      await env.DB.prepare(
        "UPDATE video_jobs SET progress = ?, status = ?, updated_at = ? WHERE id = ?"
      ).bind(progress, status, now, id).run();
      job.progress = progress;
      job.status = status;
      job.updated_at = now;
    }
  }
  return job;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/health" && request.method === "GET") {
      const real = realGpuEnabled(env);
      const persistent = persistenceReady(env);
      return json({
        ok: true,
        mode: real ? "runpod-locked" : "mock",
        version: env.APP_VERSION || "4.2",
        engine: "wan-2.2-ti2v-5b",
        persistence_ready: persistent,
        real_gpu_allowed: false,
        message: !persistent
          ? "Backend Cloudflare prêt, mais D1/R2 doivent encore être créés et liés. GPU verrouillé."
          : real
            ? "D1/R2 prêts et RunPod configuré. Le GPU reste verrouillé jusqu’à l’intégration finale du stockage vidéo."
            : "Backend Cloudflare + persistance prêts en simulation 0 €. Aucun GPU réel n’est autorisé."
      });
    }

    if (url.pathname === "/api/v1/generate" && request.method === "POST") {
      if (!persistenceReady(env)) {
        return json({ error: "Persistance Cloudflare non configurée", code: "PERSISTENCE_NOT_BOUND" }, 503);
      }

      let body;
      try { body = await request.json(); }
      catch { return json({ error: "JSON invalide" }, 400); }

      if (!body?.prompt || typeof body.prompt !== "string") {
        return json({ error: "prompt requis" }, 400);
      }

      // Financial safety: real GPU remains hard-locked in 4.2 even if secrets exist.
      if (realGpuEnabled(env)) {
        return json({
          error: "GPU réel verrouillé jusqu’à la persistance complète du MP4",
          code: "REAL_GPU_HARD_LOCKED"
        }, 409);
      }

      const id = await createMockJob(env, body);
      return json({ job_id: id, status: "processing", mode: "mock", cost_eur: 0 }, 202);
    }

    const jobMatch = url.pathname.match(/^\/api\/v1\/jobs\/([^/]+)$/);
    if (jobMatch && request.method === "GET") {
      if (!env.DB) return json({ error: "D1 non configuré" }, 503);
      const id = decodeURIComponent(jobMatch[1]);
      const job = await readJob(env, id);
      if (!job) return json({ error: "Tâche introuvable" }, 404);
      return json({
        id: job.id,
        project_id: job.project_id,
        status: job.status,
        progress: job.progress,
        mode: job.id.startsWith("mock_") ? "mock" : "runpod",
        cost_eur: job.cost_eur,
        video_url: job.video_key ? `/api/v1/videos/${encodeURIComponent(job.id)}` : null,
        error: job.error || null,
        created_at: job.created_at,
        updated_at: job.updated_at
      });
    }

    const videoMatch = url.pathname.match(/^\/api\/v1\/videos\/([^/]+)$/);
    if (videoMatch && request.method === "GET") {
      if (!persistenceReady(env)) return json({ error: "Persistance non configurée" }, 503);
      const id = decodeURIComponent(videoMatch[1]);
      const job = await env.DB.prepare("SELECT video_key FROM video_jobs WHERE id = ?").bind(id).first();
      if (!job?.video_key) return json({ error: "Vidéo indisponible" }, 404);
      const object = await env.VIDEOS.get(job.video_key);
      if (!object) return json({ error: "Fichier vidéo introuvable" }, 404);
      const headers = new Headers();
      object.writeHttpMetadata(headers);
      headers.set("etag", object.httpEtag);
      headers.set("cache-control", "private, max-age=3600");
      return new Response(object.body, { headers });
    }

    return env.ASSETS.fetch(request);
  }
};
