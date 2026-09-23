import base64
import os
import re
import subprocess
import tempfile
import time
from pathlib import Path

import boto3
import runpod

WAN_DIR = Path(os.getenv("WAN_DIR", "/workspace/Wan2.2"))
CKPT_DIR = Path(os.getenv("WAN_CKPT_DIR", "/runpod-volume/Wan2.2-TI2V-5B"))
R2_BUCKET = os.getenv("R2_BUCKET", "zaynab-studio-videos")


def data_uri_to_file(data_uri: str, path: Path):
    match = re.match(r"data:([^;]+);base64,(.*)", data_uri, re.S)
    if not match:
        raise ValueError("reference_image doit être un data URI base64")
    try:
        payload = base64.b64decode(match.group(2), validate=True)
    except Exception as exc:
        raise ValueError("reference_image base64 invalide") from exc
    if not payload:
        raise ValueError("image de référence vide")
    if len(payload) > 20 * 1024 * 1024:
        raise ValueError("image de référence trop volumineuse")
    path.write_bytes(payload)


def r2_client():
    endpoint = os.getenv("R2_ENDPOINT_URL", "").strip()
    access_key = os.getenv("R2_ACCESS_KEY_ID", "").strip()
    secret_key = os.getenv("R2_SECRET_ACCESS_KEY", "").strip()
    if not endpoint or not access_key or not secret_key or not R2_BUCKET:
        raise RuntimeError("configuration R2 incomplète")
    return boto3.client(
        "s3",
        endpoint_url=endpoint,
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
        region_name="auto",
    )


def find_generated_mp4(started_at: float, output_text: str) -> Path:
    candidates = []
    for raw in re.findall(r"[^\s'\"]+\.mp4", output_text):
        path = Path(raw)
        if not path.is_absolute():
            path = WAN_DIR / path
        if path.exists():
            candidates.append(path)

    if not candidates:
        for path in WAN_DIR.rglob("*.mp4"):
            try:
                if path.stat().st_mtime >= started_at - 2:
                    candidates.append(path)
            except OSError:
                continue

    if not candidates:
        raise RuntimeError("Wan terminé mais aucun MP4 généré n’a été trouvé")

    return max(candidates, key=lambda path: path.stat().st_mtime)


def upload_video(video_path: Path, job_id: str) -> str:
    safe_job_id = re.sub(r"[^A-Za-z0-9_-]", "_", job_id)[:120] or "runpod"
    key = f"videos/{safe_job_id}.mp4"
    r2_client().upload_file(
        str(video_path),
        R2_BUCKET,
        key,
        ExtraArgs={
            "ContentType": "video/mp4",
            "CacheControl": "private, max-age=3600",
        },
    )
    return key


def handler(job):
    payload = job.get("input", {})
    prompt = str(payload.get("prompt", "")).strip()
    image = str(payload.get("reference_image", "")).strip()
    mode = payload.get("mode", "Brouillon")
    job_id = str(payload.get("job_id") or job.get("id") or "").strip()

    if not prompt:
        return {"status": "error", "message": "prompt manquant"}
    if len(prompt) > 12000:
        return {"status": "error", "message": "prompt trop long"}
    if not image:
        return {"status": "error", "message": "image de référence manquante"}
    if mode not in {"Brouillon", "Qualité"}:
        return {"status": "error", "message": "mode invalide"}
    if not job_id:
        return {"status": "error", "message": "job_id manquant"}

    with tempfile.TemporaryDirectory() as tmp:
        image_path = Path(tmp) / "reference.jpg"
        try:
            data_uri_to_file(image, image_path)
        except ValueError as exc:
            return {"status": "error", "message": str(exc)}

        steps = "28" if mode == "Brouillon" else "50"
        runpod.serverless.progress_update(job, "10% préparation")
        cmd = [
            "python",
            str(WAN_DIR / "generate.py"),
            "--task",
            "ti2v-5B",
            "--size",
            "704*1280",
            "--ckpt_dir",
            str(CKPT_DIR),
            "--offload_model",
            "True",
            "--convert_model_dtype",
            "--t5_cpu",
            "--image",
            str(image_path),
            "--prompt",
            prompt,
            "--sample_steps",
            steps,
        ]

        runpod.serverless.progress_update(job, "20% lancement Wan")
        started_at = time.time()
        try:
            proc = subprocess.run(
                cmd,
                cwd=WAN_DIR,
                text=True,
                capture_output=True,
                timeout=1200,
            )
        except subprocess.TimeoutExpired:
            return {"status": "error", "message": "Wan a dépassé la durée maximale autorisée"}

        if proc.returncode != 0:
            return {
                "status": "error",
                "message": "Wan a échoué",
                "stderr_tail": proc.stderr[-4000:],
            }

        runpod.serverless.progress_update(job, "90% recherche du MP4")
        try:
            video_path = find_generated_mp4(started_at, proc.stdout + "\n" + proc.stderr)
            runpod.serverless.progress_update(job, "95% upload R2")
            video_key = upload_video(video_path, job_id)
        except Exception as exc:
            return {
                "status": "error",
                "message": f"persistance R2 échouée: {exc}",
            }

        return {
            "status": "success",
            "engine": "wan-2.2-ti2v-5b",
            "video_key": video_key,
            "bytes": video_path.stat().st_size,
            "message": "Wan terminé et MP4 stocké durablement dans R2.",
        }


if __name__ == "__main__":
    runpod.serverless.start({"handler": handler})
