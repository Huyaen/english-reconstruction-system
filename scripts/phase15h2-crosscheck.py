"""Phase 15h.2 · 录屏帧 vs DOM 真值对照（多轮）

把「视频里主内容消失」拆成两类：
  A) DOM 真空窗     —— #main 文本 < 12 字 / 有 .d-loading / 首子元素 opacity 0
  B) 采集链路真空窗 —— DOM 有内容，但成片在该时段没有任何新帧（编码器重复上一帧）

B 的判定不能只看亮度：转场中间态本身就是暗的。这里同时看「墨迹量」与「长间隔」。
"""
import json, os, glob
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REC = os.path.join(ROOT, "screenshots", "phase15h2", "rec")


def frame_ink(path):
    a = np.asarray(Image.open(path).convert("L"), dtype=np.float32)
    h, w = a.shape
    main = a[60:, int(w * 0.24):]
    return {"ink": float((main > 70).mean()), "std": float(main.std()), "mean": float(main.mean())}


def dom_bad(s):
    return s["textLen"] < 12 or bool(s.get("loading")) or (s.get("firstOpacity") == 0 and s["textLen"] >= 12)


def runs_of(samples, pred, gap=150):
    out, cur = [], None
    for s in samples:
        if pred(s):
            if cur is None:
                cur = {"start": s["t"], "end": s["t"], "n": 1, "info": []}
            else:
                cur["end"] = s["t"]; cur["n"] += 1
            if len(cur["info"]) < 3:
                cur["info"].append({k: s.get(k) for k in ("page", "textLen", "firstOpacity", "loading")})
        elif cur is not None:
            out.append(cur); cur = None
    if cur:
        out.append(cur)
    return [r for r in out if r["end"] - r["start"] >= gap]


def analyse_dir(d):
    meta = json.load(open(os.path.join(d, "meta.json"), encoding="utf-8"))
    stats = []
    for f in meta["frames"]:
        p = os.path.join(d, "%04d.%s" % (f["i"], f.get("ext", "jpg")))
        if not os.path.exists(p):
            continue
        st = frame_ink(p)
        st.update(t=f["t"], kind=f.get("kind", "screencast"))
        stats.append(st)

    blank = runs_of(stats, lambda s: s["ink"] < 0.003 and s["std"] < 8, gap=400)
    doms = meta.get("dom") or []
    domruns = runs_of(doms, dom_bad, gap=300)

    gaps = []
    for a, b in zip(stats, stats[1:]):
        if b["t"] - a["t"] > 700:
            gaps.append({"start": a["t"], "end": b["t"], "ms": b["t"] - a["t"],
                         "kind_prev": a["kind"], "ink_prev": round(a["ink"], 4)})

    return {
        "dir": os.path.relpath(d, ROOT), "flow": meta["clip"],
        "duration_ms": stats[-1]["t"] if stats else 0,
        "frame_count": len(stats),
        "still_frames": sum(1 for s in stats if s["kind"] == "still"),
        "dom_samples": len(doms),
        "dom_blank_runs": domruns, "frame_blank_runs": blank, "frame_gaps_over_700ms": gaps,
    }


if __name__ == "__main__":
    rows = []
    for meta_path in sorted(glob.glob(os.path.join(REC, "**", "frames-*", "meta.json"), recursive=True)):
        rows.append(analyse_dir(os.path.dirname(meta_path)))
    for r in rows:
        print(f"{r['dir']:<36} {r['duration_ms']:>6}ms frames={r['frame_count']:>4} still={r['still_frames']:>3} "
              f"domBlank={len(r['dom_blank_runs'])} frameBlank={len(r['frame_blank_runs'])} gaps={len(r['frame_gaps_over_700ms'])}")
        for x in r["dom_blank_runs"]:
            print("   DOM空窗", x["start"], x["end"], x["info"])
        for x in r["frame_blank_runs"]:
            print("   帧空白", x["start"], x["end"])
        for g in r["frame_gaps_over_700ms"]:
            print("   长间隔", g["start"], g["end"], g["ms"], "prevInk", g["ink_prev"])
    json.dump(rows, open(os.path.join(ROOT, "screenshots", "phase15h2", "crosscheck.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=2)
