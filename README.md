# Typora Lite

一个 Typora 风格的所见即所得 Markdown 编辑器，基于 **Tauri 2 (Rust)** + **React** + **Milkdown/Crepe** 打造，跨平台支持 macOS 与 Windows。

![tech](https://img.shields.io/badge/tauri-2-24C8DB) ![tech](https://img.shields.io/badge/react-19-61DAFB) ![tech](https://img.shields.io/badge/milkdown-crepe-orange)

## 功能特性

- **所见即所得**实时预览编辑（基于 Milkdown + Crepe / ProseMirror）
- 文件树侧边栏：打开文件夹、点击切换文档
- 大纲面板：自动解析标题生成可点击 TOC
- 表格、任务列表、代码块语法高亮
- LaTeX 数学公式（行内 `$...$` 与块级 `$$...$$`）
- **Mermaid 图表**：`mermaid` 代码块自动渲染为图表，点击可切换回源码编辑
- 图片粘贴/拖拽自动保存到同目录 `assets/` 文件夹并插入相对链接
- 自动保存 + 未保存状态提示
- 3 套内置主题（默认浅色 / 深色 / Nord）+ 持久化记忆
- 导出为独立 HTML 文件、导出为 PDF（通过系统打印对话框）
- 原生菜单栏（文件 / 编辑 / 视图 / 窗口）+ 常用快捷键

## 技术栈

| 层 | 选择 |
|---|---|
| 桌面运行时 | Tauri 2 (Rust) |
| 前端框架 | React 19 + TypeScript + Vite |
| WYSIWYG 编辑内核 | Milkdown + Crepe（基于 ProseMirror）|
| 数学公式 | Milkdown 官方 `Latex` 功能（KaTeX） |
| 图表 | 自定义 CodeMirror 预览渲染 + `mermaid` |
| 文件系统 | `tauri-plugin-fs` / `tauri-plugin-dialog` |
| 设置持久化 | `tauri-plugin-store` |
| 状态管理 | Zustand |
| HTML 导出 | `unified` + `remark-*` + `rehype-*` |

## 开发环境准备

1. **Node.js** ≥ 18（推荐使用最新 LTS）
2. **Rust 工具链**（通过 [rustup](https://rustup.rs/) 安装）：

   ```bash
   curl https://sh.rustup.rs -sSf | sh
   ```

3. 平台原生依赖：
   - **macOS**：安装 Xcode Command Line Tools（`xcode-select --install`）
   - **Windows**：安装 [Microsoft Visual Studio C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) 以及 WebView2（Windows 10/11 通常已自带）

## 本地开发

```bash
npm install
npm run tauri dev
```

首次编译 Rust 依赖会比较慢，后续增量编译会快很多。

## 打包构建

```bash
npm run tauri build
```

产物位于 `src-tauri/target/release/bundle/` 下（macOS 为 `.dmg`/`.app`，Windows 为 `.msi`/`.exe`）。

> 由于 Tauri 需要各平台原生工具链，**在 macOS 上无法直接交叉编译出 Windows 安装包**，反之亦然。跨平台构建请参考下方 CI 说明，或在对应平台上分别执行 `npm run tauri build`。

## 跨平台自动构建（GitHub Actions）

本仓库已配置 `.github/workflows/build.yml`，基于官方 [`tauri-apps/tauri-action`](https://github.com/tauri-apps/tauri-action)，会在 `macos-latest` 与 `windows-latest` 两个运行器上分别构建，产出 macOS 与 Windows 双平台安装包。

- 推送到 `main` 分支或手动触发（`workflow_dispatch`）即可运行
- 构建产物可在对应 workflow run 的 **Artifacts** 中下载
- 打上以 `v` 开头的 tag（例如 `v0.1.0`）会额外创建一个 GitHub Release 并自动上传安装包

## 安装包说明

本项目未配置代码签名（需要付费的 Apple Developer Program 或 Windows 代码签名证书），个人使用时：

- **macOS**：首次打开会被 Gatekeeper 拦截，右键点击 `.app` → 选择「打开」即可绕过
- **Windows**：首次运行会触发 SmartScreen 提示，点击「更多信息」→「仍要运行」即可

## 项目结构

```
src/                    前端源码
  components/           React 组件（编辑器、侧边栏、大纲、工具栏）
  lib/                  文件系统封装、导出管线、Mermaid 渲染、主题、菜单事件等
  store/                Zustand 全局状态
src-tauri/              Rust 后端（Tauri 配置、原生菜单、插件注册）
  capabilities/         权限配置(ACL)
.github/workflows/      CI 配置
```

## 明确不包含的功能（v1）

- Pandoc 驱动的 docx/odt/epub 导入导出
- 云同步、插件市场、协作编辑
- 自定义 CSS 主题编辑器
