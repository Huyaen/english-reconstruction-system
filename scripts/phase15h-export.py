"""Phase 15h · 生成评审包 review-export/phase15h-full-ui-review.zip

内容：截图（按页面/主题/尺寸）、原始视频、覆盖清单、测试报告、遗留问题、README 索引。
用法：python scripts/phase15h-export.py
"""
import json
import os
import zipfile
from datetime import datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = os.path.join(ROOT, "screenshots", "phase15h")
SHOTS_A11Y = os.path.join(ROOT, "screenshots", "phase15h1")
VIDEOS = os.path.join(SHOTS, "recording")
DOCS = os.path.join(ROOT, "docs")
OUT_DIR = os.path.join(ROOT, "review-export")
OUT = os.path.join(OUT_DIR, "phase15h-full-ui-review.zip")

PAGES = [
    ("home", "今日学习", "A 表现型"),
    ("books", "我的词库", "B 交互型"),
    ("weak", "薄弱词", "B 交互型"),
    ("sentence", "句子训练", "B 交互型"),
    ("reading", "阅读", "C 专注型"),
    ("input", "真实输入", "B 交互型"),
    ("output", "真实表达", "C 专注型"),
    ("grammar", "语法图谱", "B 交互型"),
    ("unit", "主题单元", "A 表现型"),
    ("diagnostics", "学情诊断", "A 表现型"),
    ("exam", "考试迁移", "B 交互型"),
    ("stats", "学习统计", "A 表现型"),
    ("ai", "AI 学情", "C 专注型"),
    ("settings", "设置与备份", "C 专注型"),
]
SIZES = ["1440x900", "1920x1080", "1366x768"]
THEMES = ["dark", "light"]

DOC_FILES = [
    ("PHASE15H_UI_INVENTORY.md", "全站页面与状态清单"),
    ("PHASE15H_FULL_MIGRATION.md", "逐页迁移覆盖表与未完成项"),
    ("PHASE15H_DESIGN_SYSTEM.md", "设计系统实现说明"),
    ("PHASE15H_SKILL_EXECUTION.md", "UI Skill 实际执行记录"),
    ("PHASE15H_VISUAL_REVIEW.md", "全站设计批评（双评估）"),
    ("PHASE15H_TEST_REPORT.md", "回归、性能、截图与视频报告"),
]


def rel(p):
    return os.path.relpath(p, ROOT).replace(os.sep, "/")


def main() -> int:
    os.makedirs(OUT_DIR, exist_ok=True)
    manifest_path = os.path.join(SHOTS, "capture-manifest.json")
    manifest = json.load(open(manifest_path, encoding="utf-8")) if os.path.exists(manifest_path) else {"shots": []}
    heads = {(s["page"], s["theme"], s["size"]): s.get("head", "") for s in manifest.get("shots", [])}

    lines = [
        "# 词间 · Phase 15h 全站 UI 评审包",
        "",
        f"生成时间：{datetime.now().strftime('%Y-%m-%d %H:%M')}　分支：`phase15h-full-ui-migration`",
        "",
        "这份包用于独立复核：所有截图与视频都来自真实浏览器（Edge headful），不是设计稿。",
        "",
        "## 1. 页面截图",
        "",
        "每页 3 个尺寸 × 2 个主题。文件命名：`<页面>-<主题>-<宽x高>.png`。",
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
        "## 2. 原始交互视频",
        "",
        "| 文件 | 覆盖流程 |",
        "|---|---|",
        "| `vocab-dark.mp4` | Today→词汇训练 → Preview → Recall 作答 → 退出 |",
        "| `sentence-dark.mp4` | Today→Sentence Lab → 句式操作 → 语法概念 |",
        "| `reading-dark.mp4` | Today→Reading → 打开文章 → 辅助面板 |",
        "| `io-dark.mp4` | Real Input 会话 → Output 任务与编辑 |",
        "| `data-dark.mp4` | Diagnostics 展开 → 统计时间范围 → Exam 练习 |",
        "| `mgmt-dark.mp4` | 主题单元 → 备份确认 → 深浅主题切换 |",
        "",
        "采集：headful Edge + `Page.startScreencast`，真实指针事件，逐帧真实时间戳；",
        "成片时长 == 采集时长；近黑帧审计 0/6 段。",
        "",
        "## 3. 文档",
        "",
    ]
    for f, desc in DOC_FILES:
        lines.append(f"- `docs/{f}` —— {desc}")

    lines += [
        "",
        "## 4. 重要遗留问题",
        "",
        "1. 移动端只做了「不溢出」门禁（10/10），没有重做移动端构图。",
        "2. 阅读辅助面板细操作、Output 自动保存逐秒状态、考试错因归因：只有截图，没有视频。",
        "3. 旧原型样式层（`proto15c*.css`、`reading15*.css`）仍在加载，未做删除式清理。",
        "4. `impeccable` 的 `animate / polish / bolder / overdrive` 与 `high-end-visual-design`、",
        "   `design-taste-frontend`、`anti-ui-slop` 本轮**未执行**（见 `PHASE15H_SKILL_EXECUTION.md`）。",
        "5. 用户尚未做视觉验收；本包不宣称审美目标已经达到。",
        "",
        "## 5. 复核建议顺序",
        "",
        "1. 先看 `home-dark-1440x900.png` 与 `vocab-question` 截图，确认基准语言；",
        "2. 再看 6 段视频，判断动效是否服务于学习；",
        "3. 最后抽查 `reading` / `settings` 两个 C 级页面，确认没有为了电影感牺牲可读性与可靠性。",
        "",
    ]

    readme = os.path.join(OUT_DIR, "REVIEW_INDEX.md")
    os.makedirs(OUT_DIR, exist_ok=True)
    with open(readme, "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines))

    with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as z:
        z.write(readme, "REVIEW_INDEX.md")
        for f in sorted(os.listdir(SHOTS)):
            if f.endswith(".png"):
                z.write(os.path.join(SHOTS, f), f"screenshots/{f}")
        if os.path.exists(manifest_path):
            z.write(manifest_path, "screenshots/capture-manifest.json")
        for f in sorted(os.listdir(SHOTS_A11Y)) if os.path.isdir(SHOTS_A11Y) else []:
            if f.endswith(".png") or f.endswith(".json"):
                z.write(os.path.join(SHOTS_A11Y, f), f"screenshots/phase15h1/{f}")
        for f in sorted(os.listdir(VIDEOS)) if os.path.isdir(VIDEOS) else []:
            if f.endswith(".mp4"):
                z.write(os.path.join(VIDEOS, f), f"videos/{f}")
        for f, _ in DOC_FILES:
            p = os.path.join(DOCS, f)
            if os.path.exists(p):
                z.write(p, f"docs/{f}")
        extra = ["DESIGN.md", "PRODUCT.md"]
        for f in extra:
            p = os.path.join(ROOT, f)
            if os.path.exists(p):
                z.write(p, f)

    size = os.path.getsize(OUT)
    print(json.dumps({"zip": rel(OUT), "bytes": size, "mb": round(size / 1048576, 1),
                      "png": len([f for f in os.listdir(SHOTS) if f.endswith('.png')]),
                      "mp4": len([f for f in os.listdir(VIDEOS) if f.endswith('.mp4')]) if os.path.isdir(VIDEOS) else 0},
                     ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
