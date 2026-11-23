---
version: alpha
name: 墨序 · Ink & Type Studio
description: 词间的编辑式语言学习工作台
colors:
  canvas: '#F4F0E8'
  paper: '#FDF9F0'
  text: '#242824'
  navigation: '#203E34'
  navigationText: '#FFF9ED'
  action: '#285747'
  brass: '#765725'
  success: '#246346'
  warning: '#79551F'
  error: '#9A4135'
  aiEvidence: '#335B69'
  canvasDark: '#151E19'
  paperDark: '#1B271F'
  textDark: '#F4F0E5'
  navigationDark: '#17291F'
  brassDark: '#DDB977'
  successDark: '#A4D8B5'
  warningDark: '#F0C97A'
  errorDark: '#FFB3A5'
  aiEvidenceDark: '#9DCBDA'
spacing:
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 22px
  section: 28px
  chapter: 48px
---

# 墨序 · Ink & Type Studio

## 视觉原则

词间是一间用于回忆、阅读和写作的学习工作台。用字号、留白、细线和内容之间的顺序组织信息。每页先回答用户现在可以做什么。今日的当前任务、回忆的单词、阅读的正文和写作的草稿分别承担页面的视觉重心。低密度分区用于长页面，浮层才使用明显的投影。

本文件描述当前视觉规范。旧版契约保存在 [v1.5.1 DESIGN](docs/DESIGN_V1.5.1.md)。页面路径和保留的业务契约见 [全站设计蓝图](docs/INK_STUDIO.md)。

## 主题与语义色

实际取值以 `src/tokens.css` 的 `:root` 和深色主题选择器为准。暖纸色用于外围工作面，`--paper` 用于连续读写。森林绿导航固定产品定位，黄铜用于当前项的刻线和少量英文展示字。深色有独立的纸面、文本、分隔线和状态色。成功、待处理、错误用文字与颜色共同表达。冷青的 `--ai-evidence` 只用于模型生成或推断提示，客观作答和无证据的状态沿用中性色和明确标签。

## 排版和空间

中文页标题使用 `--font-title`，优先使用系统宋体类字形。控件和密集中文信息使用本机无衬线栈。英语单词、书写和正文使用 `--font-reading`，首选 Charter，其后为 Iowan Old Style、Palatino 和 Georgia。阅读正文默认 1.3125rem、1.8 倍行高，正文栏限制长行。时间、用量、进度优先使用等宽数字字形。所有字体均可离线回退。共用间距从 4px 开始，8/12/16px 用于控件和相关文字，22/28/36px 用于区块，48/64/88px 用于页面边距和章节。

## 导航与响应式

桌面是约 192–224px 的导航和最多 1280px 的工作区。低于 961px，主入口在品牌栏下面，次级菜单通过原生展开控件访问。阅读和写作的正文与工作区可以并排，窄屏按阅读顺序排列。长表格在自身容器滚动，页面外壳不可横向溢出。当前入口用 `aria-current`、文本颜色和刻线共同表示。常用导航与主要按钮至少 44px，键盘使用可见焦点，原生对话框有可读名称和可键盘关闭的操作。

## 交互和动效

Expressive 可用现有的短暂字形和完成反馈，Focus 减少表现层，Reduced Motion 由系统偏好接管。正文和持续输入期间保持静止。禁止持续的装饰动画、截屏转场、WebGL、动态背景模糊和干扰答题的动效。保留已有暂停、键盘作答、焦点恢复、离线和本地存储降级路径。启停备份、保存草稿和调用 AI 的状态必须和真实生命周期一致。

## 数据边界

UI 不推断额外的分数和掌握率，不改变作答、调度、证据、成本和备份状态的数据来源。DB9、词条 ID、DeepSeek 和备份服务均沿用原流程。正式环境发布前验证真实备份，浏览器测试使用隔离地址和数据库。
