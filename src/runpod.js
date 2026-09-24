const RUNPOD_API_BASE = "https://api.runpod.ai/v2";
export const RUNPOD_EXECUTION_TIMEOUT_MS = 20 * 60 * 1000;
export const RUNPOD_TTL_MS = 30 * 60 * 1000;

function endpointBase(env) {
  return `${RUNPOD_API_BASE}/${encodeURIComponent(env.RUNPOD_ENDPOINT_ID)}`;
}

function headers(env) {
  return {
    "accept": "application/json",
    "authorization": `Bearer ${env.RUNPOD_API_KEY}`,
    "content-type": "application/json"
  };
}

async function parseRunpodResponse(response) {
  let payload = null;
  try { payload = await response.json(); }
  catch { payload = null; }

  if (!response.ok) {
    const message = payload?.error || payload?.message || `RunPod HTTP ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload || {};
}

export async function submitRunpodJob(env, input) {
  const response = await fetch(`${endpointBase(env)}/run`, {
    method: "POST",
    headers: headers(env),
    body: JSON.stringify({
      input,
      policy: {
        executionTimeout: RUNPOD_EXECUTION_TIMEOUT_MS,
        ttl: RUNPOD_TTL_MS,
        lowPriority: false
      }
    })
  });
  const payload = await parseRunpodResponse(response);
  if (!payload.id) throw new Error("RunPod n’a pas retourné d’identifiant de tâche");
  return payload;
}

export async function getRunpodJob(env, runpodJobId) {
  const response = await fetch(
    `${endpointBase(env)}/status/${encodeURIComponent(runpodJobId)}`,
    { headers: { "accept": "application/json", "authorization": `Bearer ${env.RUNPOD_API_KEY}` } }
  );
  return parseRunpodResponse(response);
}

export async function cancelRunpodJob(env, runpodJobId) {
  const response = await fetch(
    `${endpointBase(env)}/cancel/${encodeURIComponent(runpodJobId)}`,
    {
      method: "POST",
      headers: { "accept": "application/json", "authorization": `Bearer ${env.RUNPOD_API_KEY}` }
    }
  );
  return parseRunpodResponse(response);
}
