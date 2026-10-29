"""Phase 15h.3 评审包
只装必要的东西：三份报告、逐规则清单、转场/生命周期真值、修复前后截图、可复现脚本。
不含 frames/ 录屏中间帧（体积大且非结论）。

用法：python scripts/phase15h3-export.py
"""
from __future__ import annotations

import os
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "review-export", "phase15h3-final-review.zip")

DOCS = [
    "docs/PHASE15H3_CSS_RULE_AUDIT.md",
    "docs/PHASE15H3_NAVIGATION_EVIDENCE.md",
    "docs/PHASE15H3_TEST_REPORT.md",
    "HANDOFF.md",
    "STATE.json",
]

DATA = [
    "screenshots/phase15h3/css-rule-audit.json",
    "screenshots/phase15h3/css-rule-audit-before.json",
    "screenshots/phase15h3/css-rule-audit-after.json",
    "screenshots/phase15h3/css-match-before.json",
    "screenshots/phase15h3/css-match-after.json",
    "screenshots/phase15h3/nav-analysis.json",
    "screenshots/phase15h3/nav-screencast.json",
    "screenshots/phase15h3/nav-shots.json",
    "screenshots/phase15h3/lifecycle-before.json",
    "screenshots/phase15h3/lifecycle-after.json",
    "screenshots/phase15h3/styles-before-d.json",
    "screenshots/phase15h3/styles-before-l.json",
    "screenshots/phase15h3/styles-after-d.json",
    "screenshots/phase15h3/styles-after-l.json",
    "screenshots/phase15h3/styles-size-1366x768.json",
    "screenshots/phase15h3/styles-size-1920x1080.json",
    "screenshots/phase15h3/measure-after-activation.json",
]

SCRIPTS = [
    "scripts/phase15h3-selector-lib.mjs",
    "scripts/phase15h3-selector-fix.mjs",
    "scripts/phase15h3-css-audit.mjs",
    "scripts/phase15h3-css-probe.mjs",
    "scripts/phase15h3-helpers.js",
    "scripts/phase15h3-classify.mjs",
    "scripts/phase15h3-report.mjs",
    "scripts/phase15h3-visual-diff.mjs",
    "scripts/phase15h3-nav-continuity.mjs",
    "scripts/phase15h3-nav-sampler.js",
    "scripts/phase15h3-nav-analyze.mjs",
    "scripts/phase15h3-lifecycle.mjs",
    "scripts/phase15h3-life-instrument.js",
    "scripts/phase15h3-quiz-check.mjs",
    "tests/phase15h3.css.test.ts",
]

SHOT_DIRS = [
    "screenshots/phase15h3/before-d",
    "screenshots/phase15h3/before-l",
    "screenshots/phase15h3/after-d",
    "screenshots/phase15h3/after-l",
    "screenshots/phase15h3/size-1366x768",
    "screenshots/phase15h3/size-1920x1080",
    "screenshots/phase15h3/quiz",
]

EXTRA_SHOTS = [
    "screenshots/phase15h/grammar-dark-1366x768.png",
    "screenshots/phase15h/grammar-light-1366x768.png",
    "screenshots/phase15h/sentence-dark-1366x768.png",
    "screenshots/phase15h/sentence-light-1366x768.png",
    "screenshots/phase15h/grammar-dark-1920x1080.png",
    "screenshots/phase15h/sentence-dark-1920x1080.png",
]


def add(zf: zipfile.ZipFile, rel: str) -> int:
    src = os.path.join(ROOT, rel)
    if not os.path.exists(src):
        print(f"  ! missing {rel}")
        return 0
    if os.path.isdir(src):
        n = 0
        for name in sorted(os.listdir(src)):
            p = os.path.join(src, name)
            if os.path.isfile(p):
                zf.write(p, os.path.join(rel, name))
                n += 1
        return n
    zf.write(src, rel)
    return 1


def main() -> None:
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    total = 0
    with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(
            "README.txt",
            "Phase 15h.3 · CSS Scope Integrity & Navigation Continuity Closure\n"
            "branch: phase15h3-css-integrity\n"
            "起点: phase15h2-visual-qa @ 3ad4cc6\n\n"
            "先读 docs/PHASE15H3_CSS_RULE_AUDIT.md（口径对账 + A/B/C/D + 修复与取舍）\n"
            "再读 docs/PHASE15H3_NAVIGATION_EVIDENCE.md（五路径 × 3 轮 × 两通道）\n"
            "最后 docs/PHASE15H3_TEST_REPORT.md（门禁 + 未完成项）\n",
        )
        for group, items in (("docs", DOCS), ("data", DATA), ("scripts", SCRIPTS), ("shots", EXTRA_SHOTS)):
            n = sum(add(zf, rel) for rel in items)
            total += n
            print(f"{group}: {n}")
        for d in SHOT_DIRS:
            n = add(zf, d)
            total += n
            print(f"{d}: {n}")
    size = os.path.getsize(OUT)
    print(f"\n{OUT}\n{total} files, {size:,} bytes ({size / 1048576:.1f} MB)")


if __name__ == "__main__":
    main()
