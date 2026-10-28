"""Phase 15h.2 · 生成最终评审包 review-export/phase15h2-final-review.zip

与 15h 的包的区别：
- 视频换成修复录制链路后重录的 7 段（含真读文章、全站导航）；
- 另附 2 段旧采集的"缺陷对照"（data / sentence），只用于说明停帧问题；
- 增加 15h.2 的仪器数据（导航真值、元素测量、选择器命中、录制对照）。
用法：python scripts/phase15h2-export.py
"""
import json
import os
import zipfile
from datetime import datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = os.path.join(ROOT, "screenshots", "phase15h")
SHOTS_H1 = os.path.join(ROOT, "screenshots", "phase15h1")
H2 = os.path.join(ROOT, "screenshots", "phase15h2")
VIDEOS = os.path.join(H2, "recording")
LEGACY = os.path.join(ROOT, "screenshots", "phase15h", "recording")
DOCS = os.path.join(ROOT, "docs")
OUT_DIR = os.path.join(ROOT, "review-export")
OUT = os.path.join(OUT_DIR, "phase15h2-final-review.zip")

PAGES = [
    ("home", "今日学习", "A 表现型"), ("books", "我的词库", "B 交互型"),
    ("weak", "薄弱词", "B 交互型"), ("sentence", "句子训练", "B 交互型"),
    ("reading", "阅读", "C 专注型"), ("input", "真实输入", "B 交互型"),
    ("output", "真实表达", "C 专注型"), ("grammar", "语法图谱", "B 交互型"),
    ("unit", "主题单元", "A 表现型"), ("diagnostics", "学情诊断", "A 表现型"),
    ("exam", "考试迁移", "B 交互型"), ("stats", "学习统计", "A 表现型"),
    ("ai", "AI 学情", "C 专注型"), ("settings", "设置与备份", "C 专注型"),
]
SIZES = ["1440x900", "1920x1080", "1366x768"]
THEMES = ["dark", "light"]

DOC_FILES = [
    ("PHASE15H2_FORENSICS.md", "P0 取证：主内容消失到底是应用还是录制"),
    ("PHASE15H2_TEST_REPORT.md", "P1 修复、回归结果、证据清单、未复现与仍缺证据"),
    ("PHASE15H_UI_INVENTORY.md", "全站页面与状态清单"),
    ("PHASE15H_FULL_MIGRATION.md", "逐页迁移覆盖表与未完成项"),
    ("PHASE15H_DESIGN_SYSTEM.md", "设计系统实现说明"),
    ("PHASE15H_VISUAL_REVIEW.md", "全站设计批评（双评估）"),
    ("PHASE15H_MARKUP_BACKLOG.md", "语义标记 backlog（含 177 条死规则待决项）"),
    ("PHASE15H_TEST_REPORT.md", "15h 回归、性能、截图与视频报告"),
    ("PHASE15H1_TEST_REPORT.md", "15h.1 语义收尾报告"),
]

VIDEO_NOTES = [
    ("data-dark.mp4", "学情诊断展开 → 学习统计切 30 天 → 考试练习", "空洞 0"),
    ("io-dark.mp4", "真实输入会话 → 真实表达任务与编辑（含自动保存）", "空洞 0"),
    ("mgmt-dark.mp4", "主题单元 → 设置与备份 → 深浅主题切换", "空洞 0"),
    ("sentence-dark.mp4", "句子训练作答 → 判题反馈 → 语法图谱", "空洞 0"),
    ("vocab-dark.mp4", "词库预览 → 回忆作答 → 退出 → 今日学习", "空洞 0"),
    ("reading-real-dark.mp4", "真实导入文章 → 进阅读器 → 辅助面板 → 点读正文", "空洞 0"),
    ("nav-all-dark.mp4", "14 页依次导航（全站关键路径）", "空洞 0"),
]


def rel(p):
    return os.path.relpath(p, ROOT).replace(os.sep, "/")


def main() -> int:
    os.makedirs(OUT_DIR, exist_ok=True)
    lines = [
        "# 词间 · Phase 15h.2 最终视觉评审包",
        "",
        f"生成时间：{datetime.now().strftime('%Y-%m-%d %H:%M')}　分支：`phase15h2-visual-qa`　基线：`b4e4b2d`",
        "",
        "所有截图与视频都来自真实浏览器（headful Edge）的实际运行，不是设计稿。",
        "",
        "## 0. 本轮结论（先看这段）",
        "",
        "- 上一版视频里「主内容消失」**不是应用缺陷**：42 次导航逐帧采样 `#main` 空壳 0ms；",
        "  成因是 CDP screencast 在静止期停推，编码器重复了转场中间态那一帧。已修采集链路并重录。",
        "- 修了 3 个真实 UI 缺陷：考试单选被全局 `input{width:100%}` 撑坏、判题后选项被禁用态压到 2.72:1、",
        "  点选单选不出现整行选中态。",
        "- 诊断页「偏暗」是截图时序，不是页面问题；截图脚本已改为稳定态门控，84 张全部重拍。",
        "- 另外实测出 177 条页面级 CSS 规则从未命中（`data-page` 在 `<html>` 上）。本轮**未启用**，需单独一轮。",
        "",
        "## 1. 页面截图（稳定态）",
        "",
        "每页 3 个尺寸 × 2 个主题，全部等到「文本非空 + 无 loading + 无有限次动画 + 150ms 文本稳定」后拍摄。",
        "文件命名：`<页面>-<主题>-<宽x高>.png`。",
        "",
        "| 页面 | 等级 | 1440 深 | 1440 浅 | 1920 深 | 1920 浅 | 1366 深 | 1366 浅 |",
        "|---|---|---|---|---|---|---|---|",
    ]
    for pid, name, level in PAGES:
        cells = []
        for size in SIZES:
            for theme in THEMES:
                f = f"{pid}-{theme}-{size}.png"
                cells.append("✓" if os.path.exists(os.path.join(SHOTS, f)) else "—")
        lines.append(f"| {name} (`{pid}`) | {level} | " + " | ".join(cells) + " |")

    lines += [
        "",
        "## 2. 交互态截图（`screenshots/phase15h2/`）",
        "",
        "| 文件 | 内容 |",
        "|---|---|",
        "| `still 28 张` | 1440×900 × 深浅 × 14 页，稳定态 |",
        "| `interaction/exam-question-dark` | 考试单题未作答（单选行序） |",
        "| `interaction/exam-answered-dark` | 选中一行后的整行选中态 |",
        "| `interaction/sentence-before-dark` | 句子作答前 |",
        "| `interaction/sentence-after-dark` | 判题后（正确实线 / 误选虚线 / 其余仍可读） |",
        "| `interaction/output-typing-dark` | 表达输入 + 自动保存 live region |",
        "| `interaction/reading-article-dark` | 真实文章正文（不是导入页） |",
        "| `interaction/reading-panel-dark` | 辅助面板展开（点词标记 / 难句 / 提示） |",
        "",
        "## 3. 视频（修复采集链路后重录）",
        "",
        "| 文件 | 覆盖流程 | 帧空洞 |",
        "|---|---|---|",
    ]
    for f, note, gap in VIDEO_NOTES:
        lines.append(f"| `{f}` | {note} | {gap} |")
    lines += [
        "",
        "旧采集的 `data-dark.mp4` / `sentence-dark.mp4` 放在 `videos/legacy-capture-defect/`，",
        "只用于对照：同样的操作、同样的构建，旧片有 3–6 段停帧空洞（最长 5.85s）。",
        "",
        "## 4. 仪器数据",
        "",
        "- `data/nav-probe.json` —— 42 次导航，每 16ms 一次 `#main` 文本/透明度/loading 采样",
        "- `data/measure.json` —— 单选几何、判题对比度、诊断页密度",
        "- `data/selectors.json` —— 177 条 `[data-level] … [data-page]` 规则的命中数",
        "- `data/evidence-manifest.json` —— 每张静帧的 `readyMs` 与文本长度",
        "- `data/crosscheck.txt` —— 15 段录制 + 5 段旧录制的空洞清单",
        "",
        "## 5. 文档",
        "",
    ]
    for f, desc in DOC_FILES:
        lines.append(f"- `docs/{f}` —— {desc}")

    lines += [
        "",
        "## 6. 仍未解决",
        "",
        "1. 177 条页面级规则死代码，未启用（启用=视觉系统变更，需单轮）。",
        "2. 移动端只守不溢出，构图未重做（本轮要求不做）。",
        "3. 长文 / 万词词库下的导航时序未复测；真机读屏未测。",
        "4. Phase 15 的审美目标仍需用户亲自验收，本包不作此声明。",
        "",
        "## 7. 建议复核顺序",
        "",
        "1. `home-dark-1440x900.png` → `sentence-after-dark` → `exam-answered-dark`，确认三处修复的观感；",
        "2. `reading-real-dark.mp4` 与 `nav-all-dark.mp4`，确认页面切换全程有内容；",
        "3. 对照 `legacy-capture-defect/sentence-dark.mp4`，确认旧片空白来自录制；",
        "4. 抽查 `diagnostics-dark-1440x900.png`，确认 39 张证据卡完整。",
        "",
    ]

    readme = os.path.join(OUT_DIR, "REVIEW_INDEX.md")
    with open(readme, "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines))

    with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as z:
        z.write(readme, "REVIEW_INDEX.md")
        for f in sorted(os.listdir(SHOTS)):
            if f.endswith(".png"):
                z.write(os.path.join(SHOTS, f), f"screenshots/{f}")
        for sub in ("stills", "interaction"):
            d = os.path.join(H2, sub)
            for f in sorted(os.listdir(d)) if os.path.isdir(d) else []:
                if f.endswith(".png"):
                    z.write(os.path.join(d, f), f"screenshots/phase15h2/{sub}/{f}")
        for f in sorted(os.listdir(H2)):
            if f.endswith(".png"):
                z.write(os.path.join(H2, f), f"screenshots/phase15h2/{f}")
        for f in sorted(os.listdir(SHOTS_H1)) if os.path.isdir(SHOTS_H1) else []:
            if f.endswith(".png") or f.endswith(".json"):
                z.write(os.path.join(SHOTS_H1, f), f"screenshots/phase15h1/{f}")
        for f in sorted(os.listdir(VIDEOS)) if os.path.isdir(VIDEOS) else []:
            if f.endswith(".mp4"):
                z.write(os.path.join(VIDEOS, f), f"videos/{f}")
        for name in ("data-dark.mp4", "sentence-dark.mp4"):
            p = os.path.join(LEGACY, name)
            if os.path.exists(p):
                z.write(p, f"videos/legacy-capture-defect/{name}")
        for f in ("nav-probe.json", "measure.json", "selectors.json", "evidence-manifest.json"):
            p = os.path.join(H2, f)
            if os.path.exists(p):
                z.write(p, f"data/{f}")
        p = os.path.join(H2, "crosscheck.txt")
        if os.path.exists(p):
            z.write(p, "data/crosscheck.txt")
        for f, _ in DOC_FILES:
            p = os.path.join(DOCS, f)
            if os.path.exists(p):
                z.write(p, f"docs/{f}")
        for f in ("DESIGN.md", "PRODUCT.md"):
            p = os.path.join(ROOT, f)
            if os.path.exists(p):
                z.write(p, f)

    size = os.path.getsize(OUT)
    print(json.dumps({"zip": rel(OUT), "bytes": size, "mb": round(size / 1048576, 1)},
                     ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
