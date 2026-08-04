# Typora Lite

轻量、快速的所见即所得 Markdown 编辑器。界面与写作体验贴近 Typora，基于 **Tauri 2** 打造，安装包体积小、启动快、占用内存更低，支持 **macOS** 与 **Windows**。

![tauri](https://img.shields.io/badge/Tauri-2-24C8DB?logo=tauri&logoColor=white)
![platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows-lightgrey)
![license](https://img.shields.io/badge/license-MIT-green)

## 下载安装

请前往 GitHub **[Releases](https://github.com/JustinGastby/typora-lite/releases)** 下载对应平台的安装包，无需自行编译源码。

| 平台 | 推荐下载 |
|------|----------|
| macOS Apple Silicon（M 系列） | `Typora.Lite_*_aarch64.dmg` |
| macOS Intel | `Typora.Lite_*_x64.dmg` |
| Windows | `Typora.Lite_*_x64-setup.exe` 或 `.msi` |

当前项目未配置付费代码签名，首次打开时系统可能会提示来自未知开发者，按下面方式即可正常使用：

- **macOS**：若被 Gatekeeper 拦截，右键点击应用 → 选择「打开」
- **Windows**：若出现 SmartScreen，点击「更多信息」→「仍要运行」

## 为什么选 Typora Lite

- **真·轻量桌面应用**：Tauri + 系统 WebView，比 Electron 类编辑器更省资源
- **所见即所得**：输入 Markdown 即刻渲染，写作时少切换预览
- **开箱即用**：从 Releases 下载安装即可开始写，不必搭开发环境
- **本地优先**：文档与图片都保存在你自己的文件夹里，无强制账号与云同步

## 功能特点

- 所见即所得实时编辑（表格、任务列表、代码高亮）
- 文件树侧边栏：打开文件夹后快速切换文档；支持新建未命名文件
- 大纲面板：根据标题生成可点击目录
- LaTeX 数学公式（行内 `$...$`、块级 `$$...$$`）
- Mermaid 图表：`mermaid` 代码块自动渲染，可切回源码编辑
- 图片粘贴 / 拖拽自动保存到文档旁 `assets/`，并插入相对路径
- 本地图片引用（含 `file://`、HTML `<img>`）正确显示
- 选中图片后四角拖拽缩放
- 自动保存与未保存提示
- 多套主题：暖白 / 深色 / GitHub / 羊皮纸 / 森绿 / 午夜蓝
- 导出独立 HTML，或通过系统打印导出 PDF
- 原生菜单栏与常用快捷键（新建、打开、保存等）

## 技术概览

| 方面 | 方案 |
|------|------|
| 桌面壳 | Tauri 2（Rust） |
| 界面 | React 19 + TypeScript + Vite |
| 编辑内核 | Milkdown + Crepe（ProseMirror） |
| 公式 / 图表 | KaTeX、Mermaid |
| 本地能力 | 文件系统、对话框、设置持久化（Tauri 插件） |

用系统 WebView 承载编辑器、用 Rust 负责本地文件与系统集成，既保留 Web 富文本体验，又保持桌面应用的体积与性能优势。

## 适用场景

日常笔记、技术文档、带公式/图表的草稿、需要本地文件夹管理的 Markdown 写作。适合想要 Typora 式体验、又不想承担 Electron 体积与资源开销的用户。
