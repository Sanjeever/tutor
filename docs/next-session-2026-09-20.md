# 交班记录：首次运行问题

记录时间：2026-09-20

## 当前状态

项目已经完成 Electron、React、TypeScript、Vite、Coze Chat V3 流式调用、系统语音、语文课堂 UI、Live2D 模型接入和 Windows 打包基础能力。当前源码和构建产物已完成首次整理，但首次运行仍有两个问题没有解决，明天从这里继续。

## 问题一：打包程序不显示 Live2D

复现程序：

```text
D:\code\electron\tutor\release\win-unpacked\语文课堂数字人.exe
```

现象：

- 数字人区域显示“模型需要检查”。
- 错误信息为 `Network error`。
- 配置中的模型路径是 `assets/avatar/hiyori/Hiyori.model3.json`。

当前已确认：

- Hiyori 模型文件、纹理、物理文件和动作文件均已下载，`.model3.json` 引用的 17 个资源均存在。
- `assets/avatar/runtime/live2dcubismcore.min.js` 已内置，文件可以读取。
- 该 Core JS 内部还会按相对路径加载 `_em_module.wasm`，但当前 `assets/avatar/runtime/` 中还没有这个 WASM 文件。
- 主进程使用 `tutor-avatar` 自定义协议将模型和 Core 文件转发给渲染层，当前实现通过 `net.fetch(file://...)` 返回本地文件。

初步判断：优先补齐与官方 Core JS 配套的 `_em_module.wasm`，然后再次验证。如果仍然报网络错误，再将 `tutor-avatar` 协议改为主进程 `readFile` 后构造 `Response`，避免 Windows 下 `file://` 转发失败。

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

这些检查只证明工程可以构建和启动，不代表上述 Live2D 加载与语音听写问题已经解决。

## 明天建议顺序

1. 下载并放置与当前 Core JS 匹配的 `_em_module.wasm`。
2. 用打包程序验证 Live2D；若仍失败，修复 `tutor-avatar` 协议的本地文件响应方式。
3. 单独运行 Windows `System.Speech` 听写命令，确认 PowerShell、麦克风和语音包状态。
4. 修复语音适配器后重新打包并进行一次完整课堂链路验证。
