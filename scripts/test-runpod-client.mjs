import assert from "node:assert/strict";
import { getRunpodJob, submitRunpodJob } from "../src/runpod.js";

const env = {
  RUNPOD_API_KEY: "test-api-key",
  RUNPOD_ENDPOINT_ID: "endpoint-123"
};

const originalFetch = globalThis.fetch;

try {
  let captured;
  globalThis.fetch = async (url, options = {}) => {
    captured = { url: String(url), options };
    return new Response(JSON.stringify({ id: "rp-job-1", status: "IN_QUEUE" }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };

  const submitted = await submitRunpodJob(env, { job_id: "zaynab-job-1", prompt: "test" });
  assert.equal(submitted.id, "rp-job-1");
  assert.equal(captured.url, "https://api.runpod.ai/v2/endpoint-123/run");
  assert.equal(captured.options.method, "POST");
  assert.equal(captured.options.headers.authorization, "Bearer test-api-key");

  const body = JSON.parse(captured.options.body);
  assert.equal(body.input.job_id, "zaynab-job-1");
  assert.equal(body.policy.executionTimeout, 20 * 60 * 1000);
  assert.equal(body.policy.ttl, 30 * 60 * 1000);
  assert.equal(body.policy.lowPriority, false);

  globalThis.fetch = async (url, options = {}) => {
    captured = { url: String(url), options };
    return new Response(JSON.stringify({ id: "rp-job-1", status: "IN_PROGRESS" }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };

  const status = await getRunpodJob(env, "rp-job-1");
  assert.equal(status.status, "IN_PROGRESS");
  assert.equal(captured.url, "https://api.runpod.ai/v2/endpoint-123/status/rp-job-1");
  assert.equal(captured.options.headers.authorization, "Bearer test-api-key");

  globalThis.fetch = async () => new Response(
    JSON.stringify({ error: "provider failure" }),
    { status: 503, headers: { "content-type": "application/json" } }
  );
  await assert.rejects(
    () => submitRunpodJob(env, { prompt: "must fail" }),
    /provider failure/
  );

  console.log("RunPod client contract tests passed.");
} finally {
  globalThis.fetch = originalFetch;
}
