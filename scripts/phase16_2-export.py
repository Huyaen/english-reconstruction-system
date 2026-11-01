"""Phase 16.2 评审包导出：报告 + 改动的源码 + 检测器 + 新增测试 + 取证截图 + 门禁 JSON。

用法：python scripts/phase16_2-export.py
输出：review-export/phase16_2-review.zip
"""
import os
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "review-export")
OUT = os.path.join(OUT_DIR, "phase16_2-review.zip")

FILES = [
    "docs/PHASE16_2_COPY_FINAL_REPORT.md",
    "docs/PHASE16_1_COPY_FIX_REPORT.md",
    "docs/PHASE16_UX_WRITING_GUIDE.md",
    "HANDOFF.md",
    "STATE.json",
    "src/uiLabels.ts",
    "src/sentenceSources.ts",
    "src/inputView.ts",
    "src/inputReflection.ts",
    "src/outputView.ts",
    "src/outputTask.ts",
    "src/outputTransfer.ts",
    "src/outputSelection.ts",
    "src/readingAnalytics.ts",
    "src/app.ts",
    "scripts/lib/copyLint.mjs",
    "scripts/lib/copyLint.d.mts",
    "scripts/phase16_1-copy-lint.mjs",
    "tests/phase16_2.detector.test.ts",
    "tests/sentenceSources.test.ts",
    "tests/sentenceUi.test.ts",
    "tests/outputCore.test.ts",
    "screenshots/phase16_2/dom-scan.json",
    "screenshots/phase16_2/overflow.json",
]

SHOTS = ["screenshots/phase16_2"]


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    items = [rel for rel in FILES if os.path.exists(os.path.join(ROOT, rel))]
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


if __name__ == "__main__":
    main()
