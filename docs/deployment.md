# 部署说明

## 支持平台

- Windows
- macOS


## 开发运行

安装：

```
pnpm install
```

首次安装若 pnpm 提示构建脚本需要确认，请允许 Electron 和 esbuild 的依赖脚本执行。


运行：

```
pnpm dev
```


## 打包

Windows：

```
pnpm build:win
```


macOS：

```
pnpm build:mac
```

打包命令会分别生成 Windows NSIS/Portable 包和 macOS DMG/ZIP 包。构建前请在目标平台安装对应的原生打包环境。


发布包需要包含：

```
应用程序
config/
assets/
```

其中 `config/config.json` 位于软件资源目录，仓库默认附带两套写实 3D 教师模型：女教师 Business Female 01 和男教师 Business Male 01，分别位于 `assets/avatar/teacher-female/Export/Business_Female_01_facial.fbx` 与 `assets/avatar/teacher-male/Export/Business_Male_01_facial.fbx`，纹理位于各自的 `Textures/` 目录。设置中的教师性别会决定当前加载的模型。配置文件缺少时，应用会写入内置模型路径和语文示例问题，但仍需要补充 Coze 和百炼配置。应用通过本地 `tutor-assets` 协议加载模型和纹理资源，不访问 CDN。模型授权说明见 `assets/avatar/README.md`。

Windows 和 macOS 都通过浏览器标准麦克风能力录音。首次点击“语音听写”时，应用会申请麦克风权限；如果权限被拒绝，请在系统设置中允许本应用访问麦克风。录音会在渲染进程转换为单声道 16 kHz WAV，再由主进程发送到百炼 ASR。朗读使用百炼 TTS 返回的 WAV，不再依赖 `System.Speech`、`say` 或 Swift Speech 脚本。

macOS 打包配置包含 `NSMicrophoneUsageDescription`，Windows 使用 Electron 的媒体权限处理。百炼 API Key 只保存在软件目录的 `config/config.json`，不会进入打包脚本、日志或代码。
