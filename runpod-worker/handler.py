import os, subprocess, tempfile, base64, re
from pathlib import Path
import runpod

WAN_DIR = Path(os.getenv("WAN_DIR", "/workspace/Wan2.2"))
CKPT_DIR = Path(os.getenv("WAN_CKPT_DIR", "/runpod-volume/Wan2.2-TI2V-5B"))

def data_uri_to_file(data_uri: str, path: Path):
    m = re.match(r"data:([^;]+);base64,(.*)", data_uri, re.S)
    if not m:
        raise ValueError("reference_image doit être un data URI base64")
    path.write_bytes(base64.b64decode(m.group(2)))

def handler(job):
    i = job.get("input", {})
    prompt = i.get("prompt", "").strip()
    image = i.get("reference_image", "")
    mode = i.get("mode", "Brouillon")
    if not prompt:
        return {"status": "error", "message": "prompt manquant"}
    if not image:
        return {"status": "error", "message": "image de référence manquante"}

    with tempfile.TemporaryDirectory() as tmp:
        img = Path(tmp) / "reference.jpg"
        data_uri_to_file(image, img)
        steps = "28" if mode == "Brouillon" else "50"
        runpod.serverless.progress_update(job, "10% préparation")
        cmd = [
            "python", str(WAN_DIR / "generate.py"), "--task", "ti2v-5B",
            "--size", "704*1280", "--ckpt_dir", str(CKPT_DIR),
            "--offload_model", "True", "--convert_model_dtype", "--t5_cpu",
            "--image", str(img), "--prompt", prompt, "--sample_steps", steps
        ]
        runpod.serverless.progress_update(job, "20% lancement Wan")
        proc = subprocess.run(cmd, cwd=WAN_DIR, text=True, capture_output=True, timeout=1200)
        if proc.returncode != 0:
            return {"status": "error", "message": "Wan a échoué", "stderr_tail": proc.stderr[-4000:]}
        runpod.serverless.progress_update(job, "95% finalisation")
        # GPU remains disabled until this worker uploads the MP4 to persistent storage.
        return {"status": "success", "message": "Wan terminé. Upload R2 à connecter avant activation GPU.", "stdout_tail": proc.stdout[-2000:]}

if __name__ == "__main__":
    runpod.serverless.start({"handler": handler})
