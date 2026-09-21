# 交班记录：首次运行问题

> 历史记录：本文记录 2026-09-20 的 Live2D 阶段，仅供追溯历史问题。2026-09-21 已完成迁移：运行时改为 Three.js，内置 Microsoft Rocketbox 男/女教师 FBX 模型，旧 Live2D 资源和 Cubism Core 已删除；当前配置和部署说明以 `docs/architecture.md`、`docs/config.md` 和 `docs/deployment.md` 为准。

记录时间：2026-09-20

## 当前状态

项目已经完成 Electron、React、TypeScript、Vite、Coze Chat V3 流式调用、系统语音、极简语文课堂 UI、男女教师 Live2D 模型切换和 Windows 打包基础能力。当前默认头像是端庄长袖的女教师 Izumi，回答内容限制在固定面板内滚动。Live2D 加载问题已修复，Windows 语音听写问题仍待继续排查。

## 本次 UI 与头像更新

- 移除了“语感练习簿”、`THE EXPLANATION DESK`、英文副标题、装饰性建议卡片和底部宣传文案，界面只保留教师、回答和提问入口。
- 回答区改为固定工作区内滚动，流式回答更新时自动滚动到最新内容，不会再把头像和输入区向下撑开。
- 默认模型切换为 `assets/avatar/teacher-female/izumi_illust.model3.json`，设置中可以切换到 `assets/avatar/teacher-male/chitose.model3.json`，来源和授权说明见 `assets/avatar/README.md`。
- 旧 Hiyori 资源仍保留为可选模型，但不再作为默认模型或加载失败 fallback。

## 问题一（已修复）：开发和打包程序不显示 Live2D

复现程序：

```text
D:\code\electron\tutor\release\win-unpacked\语文课堂数字人.exe
```

现象：

- 数字人区域显示“模型需要检查”。
- 错误信息为 `Network error`。
- 配置中的模型路径是 `assets/avatar/hiyori/Hiyori.model3.json`。

修复结果：

- `src/renderer/index.html` 的 CSP `connect-src` 已加入 `tutor-avatar:`，允许 Live2D 的 XHR 和本地资源协议通信。
- `pnpm dev` 已验证 Cubism Core 5.1.0 完成初始化，不再出现 CSP 拦截或 `Network error`。

当前已确认：

- Hiyori 模型文件、纹理、物理文件和动作文件均已下载，`.model3.json` 引用的 17 个资源均存在。
- `assets/avatar/runtime/live2dcubismcore.min.js` 已内置，文件可以读取。
- 当前 Core JS 虽然包含 `_em_module.wasm` 的加载逻辑，但在 Electron 中已直接完成初始化，当前不需要额外分发 WASM 文件。
- 主进程使用 `tutor-avatar` 自定义协议将模型和 Core 文件转发给渲染层，当前实现通过 `net.fetch(file://...)` 返回本地文件。

实际原因：页面 CSP 的 `connect-src` 未允许 `tutor-avatar:`，导致模型 JSON 的 XHR 被浏览器拦截，`pixi-live2d-display` 将状态码 0 包装为 `Network error`。`net.fetch(file://...)` 不是本次故障点，不需要改写协议响应实现。

## 问题二：Windows 语音听写不可用

现象：点击“语音听写”后，Electron 报错：

```text
Error invoking remote method 'speech:listen': Error: Windows Speech API 退出码：null
```

相关实现：

```text
src/main/speech/windows-speech.ts
```

当前实现通过 `powershell.exe` 调用：

- `System.Speech.Recognition.SpeechRecognitionEngine`
- 默认音频输入设备
- `DictationGrammar`
- `Recognize()` 阻塞等待识别结果

初步判断：Node `child_process` 的 `close` 事件收到 `code = null`，说明 PowerShell 进程可能被信号终止，而不是正常返回退出码。明天需要在目标 Windows 机器上继续确认：

1. PowerShell 是否能单独加载 `System.Speech`。
2. 系统是否存在可用的默认麦克风和中文语音识别包。
3. 进程的 `signal` 字段具体是什么，以及是否被“停止听写”流程提前终止。
4. 是否需要改成独立的 Windows Speech helper，并增加识别超时/取消处理。

## 已通过的检查

- `pnpm typecheck`
- `pnpm build`
- `pnpm dev` 能启动 Electron 窗口。
- `pnpm build:win` 能生成 NSIS 和 Portable 包。
- 当前 Windows 安装包中已包含 `config/`、Hiyori 模型资源和 Cubism Core JS。

这些检查证明工程可以构建和启动；Live2D 已通过开发模式运行时验证，Windows 语音听写问题仍未解决。

## 后续建议顺序

1. 用 Windows 打包程序验证 Live2D；开发模式已经通过。
2. 单独运行 Windows `System.Speech` 听写命令，确认 PowerShell、麦克风和语音包状态。
3. 修复语音适配器后重新打包并进行一次完整课堂链路验证。
