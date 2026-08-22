CREATE TABLE IF NOT EXISTS video_jobs (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  title TEXT,
  mode TEXT NOT NULL DEFAULT 'Brouillon',
  format TEXT NOT NULL DEFAULT '9:16',
  duration TEXT NOT NULL DEFAULT '5 s',
  engine TEXT NOT NULL DEFAULT 'wan-2.2-ti2v-5b',
  status TEXT NOT NULL,
  progress INTEGER NOT NULL DEFAULT 0,
  cost_eur REAL NOT NULL DEFAULT 0,
  runpod_job_id TEXT,
  video_key TEXT,
  error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_video_jobs_updated_at
ON video_jobs(updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_video_jobs_project_id
ON video_jobs(project_id);
