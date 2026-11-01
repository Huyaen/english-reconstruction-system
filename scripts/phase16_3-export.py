"""Phase 16.3 评审包导出：报告 + 新增/改动源码 + 新测试 + 只读审计工具 + 取证截图 + 门禁 JSON。

用法：python scripts/phase16_3-export.py
输出：review-export/phase16_3-review.zip
"""
import os
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "review-export")
OUT = os.path.join(OUT_DIR, "phase16_3-review.zip")

FILES = [
    "docs/PHASE16_3_EVIDENCE_INTEGRITY_REPORT.md",
    "docs/PHASE16_2_COPY_FINAL_REPORT.md",
    "HANDOFF.md",
    "STATE.json",
    # 新增
    "src/sentenceTrust.ts",
    "src/aiTargets.ts",
    "tests/phase16_3.structureTrust.test.ts",
    "tests/phase16_3.appEvidence.test.ts",
    "tests/phase16_3.aiTargets.test.ts",
    "tests/phase16_3.sentenceSources.test.ts",
    "scripts/phase16_3-legacy-audit.mjs",
    # 改动
    "src/sentenceEvidence.ts",
    "src/sentenceLab.ts",
    "src/types.ts",
    "src/uiLabels.ts",
    "src/readingView.ts",
    "src/app.ts",
    "tests/sentenceLab.test.ts",
    "tests/sentenceUi.test.ts",
    "tests/phase16_2.detector.test.ts",
    # 门禁
    "screenshots/phase16_3/dom-scan.json",
    "screenshots/phase16_3/overflow.json",
    "screenshots/phase16_3/navsweep.json",
]

SHOTS = ["screenshots/phase16_3"]


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    items = [rel for rel in FILES if os.path.exists(os.path.join(ROOT, rel))]
    missing = [rel for rel in FILES if not os.path.exists(os.path.join(ROOT, rel))]
    for shots in SHOTS:
        shots_dir = os.path.join(ROOT, shots)
        if not os.path.isdir(shots_dir):
            continue
        for name in sorted(os.listdir(shots_dir)):
            if name.endswith(".png"):
                items.append(shots + "/" + name)
    with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for rel in items:
            z.write(os.path.join(ROOT, rel), rel)
    size = os.path.getsize(OUT) / 1e6
    print(f"items={len(items)} size={size:.1f}MB -> {OUT}")
    if missing:
        print("missing: " + ", ".join(missing))


if __name__ == "__main__":
    main()
