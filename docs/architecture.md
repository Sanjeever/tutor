# tutor 架构设计

## 总体架构

```
React Renderer
  ├─ 语文课堂工作台
  ├─ 流式回答展示
  ├─ 浏览器麦克风录音与 WAV 标准化
  ├─ 音频播放与音量分析
  └─ Three.js 写实 3D 画布
          ↓ contextBridge / IPC
Electron Main
  ├─ 配置文件读写（软件目录/config/config.json）
  ├─ Coze Chat V3 Stream
  ├─ 百炼 ASR/TTS 客户端
  └─ tutor-assets 本地资源协议
          ├─ Coze API
          ├─ 百炼 qwen-audio-3.0-asr-flash / qwen-audio-3.1-tts-flash
          └─ 软件目录/assets
```


## 核心模块

### Coze 模块

负责：

- 以 `stream: true` 发起 Chat V3 请求
- 解析 SSE 事件并转发增量消息
- 保存并复用 `conversation_id`
- 中断本地请求，同时调用取消进行中对话接口
- 支持重置会话，清除当前 `conversation_id` 和界面问答内容
- 将错误作为 IPC 事件返回渲染层


### Speech 模块

负责：

- 渲染进程申请跨平台麦克风权限，使用 `MediaRecorder` 收集录音
- 将录音解码并标准化为单声道 16 kHz WAV
- 通过 `speech:transcribe` 将音频字节交给主进程百炼 ASR
- 通过 `speech:synthesize` 请求百炼 TTS，并将完整 WAV 返回渲染层播放
- 使用 `AbortController` 取消尚未完成的 ASR/TTS 请求

录音生命周期由渲染进程管理，主进程不直接访问系统麦克风。百炼 API Key 只由主进程读取并用于 HTTP 请求，渲染进程不直接访问百炼接口。

百炼实现位于 `src/main/bailian/client.ts`、`asr.ts` 和 `tts.ts`，不调用 Windows `System.Speech`、macOS `say` 或 Swift Speech 脚本。


### Avatar 模块

负责：

- 加载本地写实教师 FBX 模型和 TGA 纹理
- 根据配置中的教师性别选择男/女教师模型
- 使用 Three.js 光照、色调映射和相机渲染模型，默认以腰部以上构图展示
- 将上臂和前臂调整为立正待机姿势，使手臂自然下垂在身体两侧
- 根据播放音频的 `AnalyserNode` 音量设置小幅面部 `JawOpen`，并自动眨眼、轻微转身；朗读时通过上臂、前臂和手部骨骼播放低幅度、交替的讲解手势

未配置模型或模型加载失败时显示简洁的教师模型状态提示；不会从 CDN 加载模型或运行时。


## 数据流

```
用户
 ├─ 文本输入 ─────────────┐
 └─ 麦克风录音 → WAV → 百炼 ASR ─┘
                         ↓
                      问题文本
 ↓
Coze Stream
 ↓
文本增量
 ↓
百炼 TTS
 ↓（WAV）
AudioBuffer + AnalyserNode
 ↓ 音量值
Three.js 面部 Morph Target
```
