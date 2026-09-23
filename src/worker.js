const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff"
  }
});

const ENGINE = "wan-2.2-ti2v-5b";
const ALLOWED_MODES = new Set(["Brouillon", "Qualité"]);
const ALLOWED_FORMATS = new Set(["9:16", "1:1"]);
const ALLOWED_DURATIONS = new Set(["5 s", "8 s", "10 s"]);
const GPU_READINESS = Object.freeze({
  engine: ENGINE,
  resolution: "704x1280",
  max_duration_seconds: 10,
  human_approval_required: true,
  estimated_cost_required: true,
  durable_r2_result_required: true
});

const GPU_QUOTE = Object.freeze({
  provider: "RunPod Serverless",
  gpu: "RTX 4090",
  vram_gb: 24,
  hourly_rate_usd: 1.10,
  hourly_rate_eur_estimate: 0.97,
  pricing_checked_at: "2026-09-23",
  fx_checked_at: "2026-09-23",
  billing: "per-second",
  generation_timeout_seconds: 1200,
  runtime_prediction_available: false,
  examples: [
    { runtime_minutes: 5, estimated_usd: 0.09, estimated_eur: 0.08 },
    { runtime_minutes: 10, estimated_usd: 0.18, estimated_eur: 0.16 },
    { runtime_minutes: 20, estimated_usd: 0.37, estimated_eur: 0.32 }
  ],
  max_compute_estimate_eur_with_25pct_buffer: 0.41,
  note: "Estimation de calcul seulement. Le temps réel sera mesuré au premier benchmark; stockage ou frais annexes éventuels sont exclus."
});

function runpodConfigured(env) {
  return Boolean(env.RUNPOD_API_KEY) && Boolean(env.RUNPOD_ENDPOINT_ID);
}

function realGpuEnabled(env) {
  return env.ALLOW_REAL_GPU === "true" && runpodConfigured(env);
}

function persistenceReady(env) {
  return Boolean(env.DB) && Boolean(env.VIDEOS);
}

function gpuReadiness(env) {
  return {
    ...GPU_READINESS,
    persistence_ready: persistenceReady(env),
    runpod_configured: runpodConfigured(env),
    allow_real_gpu_flag: env.ALLOW_REAL_GPU === "true",
    ready_for_paid_activation: false,
    real_gpu_allowed: false,
    quote: GPU_QUOTE,
    message: "Préparation uniquement. Une activation réelle exige une validation humaine séparée."
  };
}

function cleanText(value, maxLength, fallback = null) {
  if (typeof value !== "string") return fallback;
  const text = value.trim();
  if (!text) return fallback;
  return text.slice(0, maxLength);
}

function safeJobId(raw) {
  let id;
  try { id = decodeURIComponent(raw); }
  catch { return null; }
  return /^[A-Za-z0-9_-]{1,120}$/.test(id) ? id : null;
}

function crossOriginWrite(request, url) {
  const origin = request.headers.get("origin");
  return Boolean(origin) && origin !== url.origin;
}

function validateGenerateInput(input) {
  const prompt = cleanText(input?.prompt, 12000);
  if (!prompt) return { error: "prompt requis" };
  if (input.prompt.length > 12000) return { error: "prompt trop long", code: "PROMPT_TOO_LONG" };

  const mode = input?.mode || "Brouillon";
  const format = input?.format || "9:16";
  const duration = input?.duration || "5 s";

  if (!ALLOWED_MODES.has(mode)) return { error: "mode invalide" };
  if (!ALLOWED_FORMATS.has(format)) return { error: "format invalide" };
  if (!ALLOWED_DURATIONS.has(duration)) return { error: "durée invalide" };

  return {
    value: {
      prompt,
      project_id: cleanText(input?.project_id, 120),
      title: cleanText(input?.title, 200),
      mode,
      format,
      duration
    }
  };
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
    input.project_id,
    input.title,
    input.mode,
    input.format,
    input.duration,
    ENGINE,
    now,
    now
  ).run();
  return id;
}

async function readJob(env, id) {
  const job = await env.DB.prepare("SELECT * FROM video_jobs WHERE id = ?").bind(id).first();
  if (!job) return null;

  if (job.id.startsWith("mock_") && job.status === "processing") {
    const elapsed = Math.max(0, Date.now() - Date.parse(job.created_at));
    const progress = elapsed >= 8000 ? 100 : Math.min(99, Math.max(5, Math.round(elapsed / 80)));
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

function publicJob(job) {
  return {
    id: job.id,
    project_id: job.project_id,
    title: job.title,
    status: job.status,
    progress: job.progress,
    mode: job.id.startsWith("mock_") ? "mock" : "runpod",
    render_mode: job.mode,
    format: job.format,
    duration: job.duration,
    engine: job.engine,
    cost_eur: job.cost_eur,
    video_url: job.video_key ? `/api/v1/videos/${encodeURIComponent(job.id)}` : null,
    error: job.error || null,
    created_at: job.created_at,
    updated_at: job.updated_at
  };
}

async function listJobs(env, url) {
  if (!env.DB) return json({ error: "D1 non configuré" }, 503);
  const projectId = cleanText(url.searchParams.get("project_id"), 120);
  if (!projectId) return json({ error: "project_id requis", code: "PROJECT_ID_REQUIRED" }, 400);
  const result = await env.DB.prepare(
    "SELECT * FROM video_jobs WHERE project_id = ? ORDER BY updated_at DESC LIMIT 30"
  ).bind(projectId).all();
  return json({ jobs: (result.results || []).map(publicJob) });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/health" && request.method === "GET") {
      const persistent = persistenceReady(env);
      const configured = runpodConfigured(env);
      return json({
        ok: true,
        mode: realGpuEnabled(env) ? "runpod-locked" : "mock",
        version: env.APP_VERSION || "4.2",
        engine: ENGINE,
        persistence_ready: persistent,
        runpod_configured: configured,
        real_gpu_allowed: false,
        gpu_policy: GPU_READINESS,
        message: !persistent
          ? "Backend Cloudflare prêt, mais D1/R2 doivent encore être liés. GPU verrouillé."
          : configured
            ? "D1/R2 prêts et RunPod configuré. Le GPU reste verrouillé par sécurité."
            : "Backend Cloudflare + persistance prêts en simulation 0 €. Aucun GPU réel n’est autorisé."
      });
    }

    if (url.pathname === "/api/v1/gpu-readiness" && request.method === "GET") {
      return json(gpuReadiness(env));
    }

    if (url.pathname === "/api/v1/render-quote" && request.method === "GET") {
      return json({
        ...GPU_QUOTE,
        engine: ENGINE,
        resolution: GPU_READINESS.resolution,
        real_gpu_allowed: false,
        approval_required: true,
        quote_status: "informational_only"
      });
    }

    if (url.pathname === "/api/v1/jobs" && request.method === "GET") {
      return listJobs(env, url);
    }

    if (url.pathname === "/api/v1/generate" && request.method === "POST") {
      if (crossOriginWrite(request, url)) {
        return json({ error: "Origine non autorisée", code: "CROSS_ORIGIN_WRITE_BLOCKED" }, 403);
      }
      if (!persistenceReady(env)) {
        return json({ error: "Persistance Cloudflare non configurée", code: "PERSISTENCE_NOT_BOUND" }, 503);
      }

      let body;
      try {
        body = await request.json();
      } catch {
        return json({ error: "JSON invalide" }, 400);
      }

      const checked = validateGenerateInput(body);
      if (checked.error) return json({ error: checked.error, code: checked.code || "INVALID_INPUT" }, 400);

      // Financial safety: real GPU stays hard-locked even if credentials are present.
      if (realGpuEnabled(env)) {
        return json({
          error: "GPU réel verrouillé jusqu’à validation humaine de la chaîne vidéo",
          code: "REAL_GPU_HARD_LOCKED",
          readiness: gpuReadiness(env)
        }, 409);
      }

      const id = await createMockJob(env, checked.value);
      return json({ job_id: id, status: "processing", mode: "mock", cost_eur: 0 }, 202);
    }

    const jobMatch = url.pathname.match(/^\/api\/v1\/jobs\/([^/]+)$/);
    if (jobMatch && request.method === "GET") {
      if (!env.DB) return json({ error: "D1 non configuré" }, 503);
      const id = safeJobId(jobMatch[1]);
      if (!id) return json({ error: "Identifiant de tâche invalide" }, 400);
      const job = await readJob(env, id);
      if (!job) return json({ error: "Tâche introuvable" }, 404);
      return json(publicJob(job));
    }

    const videoMatch = url.pathname.match(/^\/api\/v1\/videos\/([^/]+)$/);
    if (videoMatch && request.method === "GET") {
      if (!persistenceReady(env)) return json({ error: "Persistance non configurée" }, 503);
      const id = safeJobId(videoMatch[1]);
      if (!id) return json({ error: "Identifiant de tâche invalide" }, 400);
      const job = await env.DB.prepare("SELECT video_key FROM video_jobs WHERE id = ?").bind(id).first();
      if (!job?.video_key) return json({ error: "Vidéo indisponible" }, 404);
      const object = await env.VIDEOS.get(job.video_key);
      if (!object) return json({ error: "Fichier vidéo introuvable" }, 404);
      const headers = new Headers();
      object.writeHttpMetadata(headers);
      headers.set("etag", object.httpEtag);
      headers.set("cache-control", "private, max-age=3600");
      headers.set("x-content-type-options", "nosniff");
      return new Response(object.body, { headers });
    }

    if (url.pathname.startsWith("/api/")) {
      return json({ error: "Route API introuvable" }, 404);
    }

    return env.ASSETS.fetch(request);
  }
};
