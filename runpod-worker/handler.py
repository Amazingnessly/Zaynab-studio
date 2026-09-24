import base64
import re
import subprocess
import tempfile
import time
import shutil
from pathlib import Path
from urllib.parse import urlparse

import requests
import runpod
import torch

WAN_DIR = Path(__import__("os").getenv("WAN_DIR", "/opt/Wan2.2"))
WAN_MODEL_ID = __import__("os").getenv("WAN_MODEL_ID", "Wan-AI/Wan2.2-TI2V-5B").strip()
WAN_CKPT_DIR = __import__("os").getenv("WAN_CKPT_DIR", "").strip()
ZAYNAB_UPLOAD_HOST = __import__("os").getenv(
    "ZAYNAB_UPLOAD_HOST",
    "zaynab-studio-staging.gassamasa.workers.dev",
).strip().lower()


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


def validate_upload_target(upload_url: str, upload_token: str):
    parsed = urlparse(upload_url)
    if parsed.scheme != "https" or not parsed.netloc:
        raise ValueError("upload_url HTTPS invalide")
    if parsed.username or parsed.password or parsed.port not in {None, 443}:
        raise ValueError("upload_url non autorisée")
    if (parsed.hostname or "").lower() != ZAYNAB_UPLOAD_HOST:
        raise ValueError("hôte d’upload non autorisé")
    if not parsed.path.startswith("/api/v1/uploads/"):
        raise ValueError("upload_url non autorisée")
    if len(upload_token) < 32 or len(upload_token) > 256:
        raise ValueError("upload_token invalide")


def resolve_checkpoint_dir() -> Path:
    if WAN_CKPT_DIR:
        explicit = Path(WAN_CKPT_DIR)
        if explicit.exists():
            return explicit

    if "/" not in WAN_MODEL_ID:
        raise RuntimeError("WAN_MODEL_ID invalide")

    org, name = WAN_MODEL_ID.split("/", 1)
    model_root = (
        Path("/runpod-volume/huggingface-cache/hub")
        / f"models--{org}--{name}"
        / "snapshots"
    )
    if not model_root.exists():
        raise RuntimeError(
            f"modèle RunPod cache introuvable: {WAN_MODEL_ID}"
        )

    snapshots = [path for path in model_root.iterdir() if path.is_dir()]
    if not snapshots:
        raise RuntimeError(
            f"aucun snapshot RunPod cache disponible: {WAN_MODEL_ID}"
        )
    return max(snapshots, key=lambda path: path.stat().st_mtime)


@runpod.serverless.register_fitness_check
def check_zaynab_worker():
    if not torch.cuda.is_available():
        raise RuntimeError("GPU CUDA indisponible")

    total_vram_gb = torch.cuda.get_device_properties(0).total_memory / (1024 ** 3)
    if total_vram_gb < 40:
        raise RuntimeError(
            f"VRAM insuffisante: {total_vram_gb:.1f} GB (classe 48 GB attendue)"
        )

    generate_script = WAN_DIR / "generate.py"
    if not generate_script.exists():
        raise RuntimeError(f"script Wan introuvable: {generate_script}")

    checkpoint_dir = resolve_checkpoint_dir()
    try:
        has_model_files = any(checkpoint_dir.iterdir())
    except OSError as exc:
        raise RuntimeError(f"checkpoint Wan illisible: {exc}") from exc
    if not has_model_files:
        raise RuntimeError(f"checkpoint Wan vide: {checkpoint_dir}")

    if shutil.which("ffmpeg") is None:
        raise RuntimeError("ffmpeg introuvable")


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


def upload_video(video_path: Path, upload_url: str, upload_token: str) -> dict:
    validate_upload_target(upload_url, upload_token)
    size = video_path.stat().st_size
    if size <= 0:
        raise RuntimeError("MP4 généré vide")
    if size > 100 * 1024 * 1024:
        raise RuntimeError("MP4 généré trop volumineux")

    headers = {
        "Authorization": f"Bearer {upload_token}",
        "Content-Type": "video/mp4",
        "Content-Length": str(size),
    }
    with video_path.open("rb") as handle:
        response = requests.put(
            upload_url,
            data=handle,
            headers=headers,
            timeout=(10, 300),
            allow_redirects=False,
        )
    if response.status_code not in {200, 201}:
        raise RuntimeError(f"upload Cloudflare refusé ({response.status_code})")

    try:
        result = response.json()
    except ValueError as exc:
        raise RuntimeError("réponse d’upload Cloudflare invalide") from exc

    if not result.get("ok") or not result.get("video_key"):
        raise RuntimeError("upload Cloudflare incomplet")
    return result


def handler(job):
    payload = job.get("input", {})
    prompt = str(payload.get("prompt", "")).strip()
    image = str(payload.get("reference_image", "")).strip()
    mode = payload.get("mode", "Brouillon")
    duration = str(payload.get("duration", "5 s")).strip()
    job_id = str(payload.get("job_id") or job.get("id") or "").strip()
    upload_url = str(payload.get("upload_url", "")).strip()
    upload_token = str(payload.get("upload_token", "")).strip()

    if not prompt:
        return {"status": "error", "message": "prompt manquant"}
    if len(prompt) > 12000:
        return {"status": "error", "message": "prompt trop long"}
    if not image:
        return {"status": "error", "message": "image de référence manquante"}
    if mode not in {"Brouillon", "Qualité"}:
        return {"status": "error", "message": "mode invalide"}
    frame_num_by_duration = {"5 s": 121, "8 s": 193, "10 s": 241}
    if duration not in frame_num_by_duration:
        return {"status": "error", "message": "durée invalide"}
    if not job_id:
        return {"status": "error", "message": "job_id manquant"}
    try:
        validate_upload_target(upload_url, upload_token)
    except ValueError as exc:
        return {"status": "error", "message": str(exc)}

    with tempfile.TemporaryDirectory() as tmp:
        image_path = Path(tmp) / "reference.jpg"
        try:
            data_uri_to_file(image, image_path)
        except ValueError as exc:
            return {"status": "error", "message": str(exc)}

        steps = "28" if mode == "Brouillon" else "50"
        try:
            checkpoint_dir = resolve_checkpoint_dir()
        except RuntimeError as exc:
            return {"status": "error", "message": str(exc)}

        runpod.serverless.progress_update(job, "10% préparation")
        cmd = [
            "python",
            str(WAN_DIR / "generate.py"),
            "--task",
            "ti2v-5B",
            "--size",
            "704*1280",
            "--ckpt_dir",
            str(checkpoint_dir),
            "--offload_model",
            "True",
            "--convert_model_dtype",
            "--t5_cpu",
            "--image",
            str(image_path),
            "--prompt",
            prompt,
            "--frame_num",
            str(frame_num_by_duration[duration]),
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
            runpod.serverless.progress_update(job, "95% upload sécurisé Cloudflare")
            upload_result = upload_video(video_path, upload_url, upload_token)
        except Exception as exc:
            return {
                "status": "error",
                "message": f"persistance vidéo échouée: {exc}",
            }

        return {
            "status": "success",
            "engine": "wan-2.2-ti2v-5b",
            "duration": duration,
            "frame_num": frame_num_by_duration[duration],
            "video_key": upload_result["video_key"],
            "bytes": upload_result.get("uploaded_bytes", video_path.stat().st_size),
            "message": "Wan terminé et MP4 stocké durablement via Cloudflare.",
        }


if __name__ == "__main__":
    runpod.serverless.start({"handler": handler})
