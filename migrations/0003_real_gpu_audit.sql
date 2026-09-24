ALTER TABLE video_jobs ADD COLUMN approved_cost_eur REAL;
ALTER TABLE video_jobs ADD COLUMN approval_at TEXT;
ALTER TABLE video_jobs ADD COLUMN provider_execution_ms INTEGER;

CREATE INDEX IF NOT EXISTS idx_video_jobs_runpod_job_id
ON video_jobs(runpod_job_id);
