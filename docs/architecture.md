# tutor 架构设计

## 总体架构

```
React Renderer
  ├─ 语文课堂工作台
  ├─ 流式回答展示
  ├─ 音频播放与音量分析
  └─ Live2D 画布
          ↓ contextBridge / IPC
Electron Main
  ├─ 配置文件读写（软件目录/config/config.json）
  ├─ Coze Chat V3 Stream
  ├─ 系统语音适配器
  └─ tutor-avatar 本地资源协议
          ├─ Coze API
          ├─ Windows Speech API / macOS Speech + say
          └─ 软件目录/assets
```


## 核心模块

### Coze 模块

负责：

- 以 `stream: true` 发起 Chat V3 请求
- 解析 SSE 事件并转发增量消息
- 保存并复用 `conversation_id`
- 中断本地请求，同时调用取消进行中对话接口
- 将错误作为 IPC 事件返回渲染层


### Speech 模块

负责：

- 系统 ASR
- 将系统 TTS 生成的 WAV 音频返回渲染层播放

根据系统平台选择实现。

Windows 使用 PowerShell 调用 `System.Speech`；macOS 使用 `say` 生成音频，并通过随应用分发的 Swift Speech API 脚本进行听写。业务层只依赖 `SpeechAdapter`，不感知平台细节。


### Avatar 模块

负责：

- 加载本地 `.model3.json` 和 Cubism Core
- 播放 Idle 基础动作
- 根据播放音频的 `AnalyserNode` 音量设置 `ParamMouthOpenY`

未配置模型或模型加载失败时显示简洁的教师模型状态提示；不会从 CDN 加载 Live2D 运行时。


## 数据流

```
用户
 ↓
输入
 ↓
Coze Stream
 ↓
文本增量
 ↓
TTS
 ↓（系统 TTS WAV）
AudioBuffer + AnalyserNode
 ↓ 音量值
Live2D Mouth 参数
```
