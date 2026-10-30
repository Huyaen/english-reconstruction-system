"""Phase 15h.4 评审包

只装结论与可复现材料：根因文档、测试报告、每检查点真值、修复前后作用域对照、42 张关键状态截图、复跑脚本。
用法：python scripts/phase15h4-export.py
"""
from __future__ import annotations

import os
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "review-export", "phase15h4-final-review.zip")

FILES = [
    "docs/PHASE15H4_ROOT_CAUSE_AND_FIX.md",
    "docs/PHASE15H4_TEST_REPORT.md",
    "HANDOFF.md",
    "STATE.json",
    "screenshots/phase15h4/scope-before-dark.json",
    "screenshots/phase15h4/scope-after-dark.json",
    "screenshots/phase15h4/scope-after-light.json",
    "screenshots/phase15h4/flow-dark.json",
    "screenshots/phase15h4/flow-light.json",
    "screenshots/phase15h4/nav-sweep.json",
    "scripts/phase15h4-stateflow.mjs",
    "scripts/phase15h4-scope-probe.mjs",
    "scripts/phase15h4-navsweep.mjs",
    "tests/phase15h4.pageState.test.ts",
    "tests/support/css-loader.mjs",
    "src/ui/motion.ts",
]

DIRS = ["screenshots/phase15h4/dark", "screenshots/phase15h4/light"]


def main() -> None:
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    total = 0
    with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(
            "README.txt",
            "Phase 15h.4 · Quiz Page State Synchronization Hotfix\n"
            "branch: phase15h4-quiz-state-hotfix\n"
            "base:   phase15h3-css-integrity @ 691a97c\n\n"
            "先读 docs/PHASE15H4_ROOT_CAUSE_AND_FIX.md（根因 / 修复位置 / 修复前后 state 对照）\n"
            "再读 docs/PHASE15H4_TEST_REPORT.md（7 条业务路径 × 2 主题 × 21 检查点 + 门禁 + 未覆盖项）\n"
            "真值：scope-*.json（修复前/后同一套动作的读数）、flow-*.json（每检查点全字段）、nav-sweep.json\n"
            "截图：dark/ 与 light/ 各 21 张，文件名即检查点名（A1-books … D6-results-back-home）\n",
        )
        for rel in FILES:
            src = os.path.join(ROOT, rel)
            if not os.path.exists(src):
                print(f"  ! missing {rel}")
                continue
            zf.write(src, rel)
            total += 1
        for rel in DIRS:
            src = os.path.join(ROOT, rel)
            for name in sorted(os.listdir(src)):
                p = os.path.join(src, name)
                if os.path.isfile(p):
                    zf.write(p, os.path.join(rel, name))
                    total += 1
    size = os.path.getsize(OUT)
    print(f"{OUT}\n{total} files, {size:,} bytes ({size / 1048576:.1f} MB)")


if __name__ == "__main__":
    main()
