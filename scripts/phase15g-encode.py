"""Phase 15g · 把逐帧采集编码成 mp4

- 按真实时间轴重采样到固定帧率（默认 60fps，最多丢 1 帧/次的冗余），
  成片时长 = 采集真实时长，不裁剪、不加速、不丢事件。
- 指针环：CDP 截图不含系统光标，这里按事件日志在同一时钟上叠加（唯一的人工合成层）。

用法：python scripts/phase15g-encode.py screenshots/phase15g/recording/frames-<clip>-<theme>
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile

from PIL import Image, ImageDraw

TARGET_FPS = 60


def encode(frames_dir: str) -> int:
    meta = json.load(open(os.path.join(frames_dir, "meta.json"), encoding="utf-8"))
    frames = [f for f in meta["frames"] if os.path.exists(os.path.join(frames_dir, "%04d.jpg" % f["i"]))]
    if not frames:
        print("NO-FRAMES", frames_dir)
        return 1

    t0, t1 = frames[0]["t"], frames[-1]["t"]
    span = max(0.2, (t1 - t0) / 1000.0)
    raw_fps = len(frames) / span
    fps = min(TARGET_FPS, max(24, round(raw_fps)))
    ticks = int(round(span * fps))

    # 每个输出帧取时间上最近的真实帧（不改变时间轴，只去掉重复采样）
    picks = []
    j = 0
    for k in range(ticks):
        target = t0 + (k / fps) * 1000.0
        while j + 1 < len(frames) and abs(frames[j + 1]["t"] - target) <= abs(frames[j]["t"] - target):
            j += 1
        picks.append(frames[j])

    tmp = tempfile.mkdtemp(prefix="enc15g-")
    seq = os.path.join(tmp, "seq")
    os.makedirs(seq, exist_ok=True)

    for i, f in enumerate(picks):
        src = os.path.join(frames_dir, "%04d.jpg" % f["i"])
        dst = os.path.join(seq, "%04d.jpg" % i)
        if f.get("visible"):
            img = Image.open(src).convert("RGB")
            d = ImageDraw.Draw(img, "RGBA")
            cx, cy = f["px"], f["py"]
            r = 8 if f.get("down") else 11
            d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=(255, 255, 255, 235), width=2)
            d.ellipse([cx - 2, cy - 2, cx + 2, cy + 2], fill=(255, 255, 255, 245))
            if f.get("down"):
                d.ellipse([cx - 5, cy - 5, cx + 5, cy + 5], outline=(255, 214, 150, 255), width=2)
            img.save(dst, quality=90)
        else:
            shutil.copyfile(src, dst)

    out_dir = os.path.dirname(frames_dir.rstrip("/" + os.sep))
    mp4 = os.path.join(out_dir, "%s-%s.mp4" % (meta["clip"], meta["theme"]))
    cp = subprocess.run(
        ["ffmpeg", "-hide_banner", "-loglevel", "error", "-framerate", str(fps),
         "-i", os.path.join(seq, "%04d.jpg"),
         "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2",
         "-c:v", "libx264", "-preset", "medium", "-crf", "19", "-pix_fmt", "yuv420p",
         "-movflags", "+faststart", "-y", mp4],
        capture_output=True, text=True)
    if cp.returncode != 0:
        print("FFMPEG-FAIL", cp.stderr[-500:])
        return 1

    dur = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", mp4],
        capture_output=True, text=True).stdout.strip()
    print(json.dumps({"mp4": mp4, "src_frames": len(frames), "out_frames": len(picks),
                      "fps": fps, "capture_seconds": round(span, 2),
                      "video_seconds": round(float(dur), 2) if dur else None}))
    return 0


if __name__ == "__main__":
    sys.exit(encode(sys.argv[1]))
