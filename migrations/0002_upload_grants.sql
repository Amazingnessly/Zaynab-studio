ALTER TABLE video_jobs ADD COLUMN upload_token_hash TEXT;
ALTER TABLE video_jobs ADD COLUMN upload_expires_at TEXT;
ALTER TABLE video_jobs ADD COLUMN uploaded_bytes INTEGER;

CREATE INDEX IF NOT EXISTS idx_video_jobs_upload_expires_at
ON video_jobs(upload_expires_at);
