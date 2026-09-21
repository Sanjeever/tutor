# AGENTS.md

## 项目定位

tutor 是一个基于 Electron 的 AI 课堂数字人桌面软件。

软件运行于：

- Windows
- macOS

使用场景：

教师在课堂打开软件，学生通过文字或语音向数字人提问，数字人调用 Coze 智能体生成回答，并通过系统语音播报。


## 核心技术约束

桌面框架：

- Electron
- React
- TypeScript
- Vite

AI 服务：

- Coze Chat V3 API
- 必须使用流式响应模式

Coze 文档：

https://docs.coze.cn/developer_guides_chat_v3


语音：

- Windows 使用系统自带语音识别和语音合成
- macOS 使用系统自带语音识别和语音合成

禁止接入第三方收费 ASR/TTS 服务。


数字人：

- Three.js
- 本地写实 3D 教师模型资源（FBX + TGA 纹理）
- 使用模型内置面部 Morph Target 驱动口型和基础表情


## 功能链路

```
学生输入
    |
    ↓
文本输入 / 系统 ASR
    |
    ↓
Coze Chat V3 Stream
    |
    ↓
实时文本回复
    |
    ↓
系统 TTS
    |
    ↓
音频播放
    |
    ↓
Three.js 3D 面部 Morph Target 同步
```


## 配置要求

所有配置保存在软件目录。

目录：

```
config/
 └── config.json
```

配置包括：

- Coze Token
- Coze Agent ID
- 用户 ID
- 默认问题
- 男/女教师 3D 模型路径


禁止：

- 数据库存储配置
- 云端配置中心
- 用户目录隐藏配置


## 跨平台要求

必须同时兼容 Windows 和 macOS。

禁止：

- 写死系统路径
- 直接调用单个平台 API
- 将 Windows/macOS 逻辑散落在业务代码


系统能力必须抽象。

示例：

```
services/
 ├── speech.ts
 ├── windows-speech.ts
 └── macos-speech.ts
```


## Coze 开发要求

Coze 调用必须封装独立模块。

示例：

```
services/
 └── coze/
      ├── client.ts
      └── stream.ts
```

要求：

- 支持流式事件解析
- 支持增量文本展示
- 支持错误处理
- 支持中断请求


## 工程规范

修改代码前：

1. 阅读 AGENTS.md
2. 阅读 docs/
3. 理解现有结构


完成修改后：

同步更新相关文档。


避免：

- 过度抽象
- 引入无必要依赖
- 创建后端服务
