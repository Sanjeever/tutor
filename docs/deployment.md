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

其中 `config/config.json` 位于软件资源目录，仓库默认附带两套官方免费示例模型：女教师 Izumi 和男教师 Chitose，分别位于 `assets/avatar/teacher-female/izumi_illust.model3.json` 与 `assets/avatar/teacher-male/chitose.model3.json`，同时内置 `assets/avatar/runtime/live2dcubismcore.min.js`。设置中的教师性别会决定当前加载的模型。配置文件缺少时，应用也会自动恢复内置模型路径和语文示例问题，因此只需补充 Coze Token 与 bot ID 即可开始使用。应用通过本地 `tutor-avatar` 协议加载模型资源，不访问 CDN。模型和 Core 授权说明见 `assets/avatar/README.md` 与 `assets/avatar/runtime/README.md`。

macOS 听写依赖系统 Speech 框架和 `xcrun swift`，首次使用时需要在系统设置中授予麦克风与语音识别权限。Windows 听写和朗读使用系统 `System.Speech`，不接入第三方 ASR/TTS 服务。
