"""Phase 16.1 评审包导出：报告 + 文档 + 检测脚本 + 测试 + 深色取证截图 + JSON。

用法：python scripts/phase16_1-export.py
输出：review-export/phase16_1-review.zip
"""
import os
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "review-export")
OUT = os.path.join(OUT_DIR, "phase16_1-review.zip")

FILES = [
    "docs/PHASE16_1_COPY_FIX_REPORT.md",
    "docs/PHASE16_UX_WRITING_GUIDE.md",
    "docs/PHASE16_COPY_CHANGELOG.md",
    "HANDOFF.md",
    "STATE.json",
    "src/uiLabels.ts",
    "scripts/lib/copyLint.mjs",
    "scripts/lib/copyLint.d.mts",
    "scripts/phase16_1-copy-lint.mjs",
    "scripts/phase16_1-dom-scan.mjs",
    "scripts/phase16_1-overflow.mjs",
    "tests/phase16_1.copyLeak.test.ts",
    "screenshots/phase16_1/dom-scan.json",
    "screenshots/phase16_1/overflow.json",
]

SHOTS = "screenshots/phase16_1"


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    items = []
    for rel in FILES:
        p = os.path.join(ROOT, rel)
        if os.path.exists(p):
            items.append(rel)
    shots_dir = os.path.join(ROOT, SHOTS)
    if os.path.isdir(shots_dir):
        for name in sorted(os.listdir(shots_dir)):
            if name.endswith(".png"):
                items.append(SHOTS + "/" + name)
    with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for rel in items:
            z.write(os.path.join(ROOT, rel), rel)
    size = os.path.getsize(OUT) / 1e6
    print(f"items={len(items)} size={size:.1f}MB -> {OUT}")


if __name__ == "__main__":
    main()
