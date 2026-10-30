"""Phase 16 评审包：把文案规范、台账、报告、脚本、证据与截图打成一个 zip。

用法：python scripts/phase16-export.py
输出：review-export/phase16-final-review.zip
"""
import os
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "review-export", "phase16-final-review.zip")

ITEMS = [
    ("docs", [
        "PHASE16_UX_WRITING_GUIDE.md",
        "PHASE16_COPY_CHANGELOG.md",
        "PHASE16_TEST_REPORT.md",
        "PHASE15H4_ROOT_CAUSE_AND_FIX.md",
        "PHASE15H4_TEST_REPORT.md",
    ]),
    ("root", ["HANDOFF.md", "STATE.json", "index.html"]),
    ("scripts", [
        "phase16-copy-audit.mjs",
        "phase16-capture-copy.mjs",
        "phase16-copy-diff.mjs",
        "phase16-prod-accept.mjs",
        "phase16-forbidden-scan.mjs",
        "phase15c-contrast.mjs",
    ]),
    ("screenshots/phase16", [
        "copy-inventory.json",
        "copy-inventory.md",
        "copy-live-dark.json",
        "copy-after-dark.json",
        "copy-after-light.json",
        "copy-diff.json",
        "copy-diff.md",
    ]),
]

DIRS = [
    "screenshots/phase16/prod",
]


def main() -> None:
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    count = 0
    with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for sub, names in ITEMS:
            base = ROOT if sub == "root" else os.path.join(ROOT, sub)
            for name in names:
                path = os.path.join(base, name)
                if not os.path.exists(path):
                    print("SKIP", path)
                    continue
                arc = name if sub == "root" else os.path.join(sub, name).replace("\\", "/")
                z.write(path, arc)
                count += 1
        for d in DIRS:
            full = os.path.join(ROOT, d)
            if not os.path.isdir(full):
                continue
            for name in sorted(os.listdir(full)):
                path = os.path.join(full, name)
                if os.path.isfile(path):
                    z.write(path, os.path.join(d, name).replace("\\", "/"))
                    count += 1
    size = os.path.getsize(OUT)
    print(f"items={count} size={size/1024/1024:.1f}MB -> {OUT}")


if __name__ == "__main__":
    main()
