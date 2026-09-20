# Live2D 模型资源

应用默认使用 Live2D 官方免费示例模型 Haru（接待版本），作为课堂中的语文教师形象：

```text
assets/avatar/haru-greeter/haru_greeter_t05.model3.json
```

模型来自 Live2D 官方示例数据集，插画与建模均由 Live2D 完成。项目没有修改模型文件，只在界面中将它作为语文教师使用。官方页面明确说明该模型可用于问候、数字标牌、接待、引导等场景；项目沿用原始角色设计和资源文件。

来源：

- [Haru（接待版本）官方介绍](https://www.live2d.com/zh-CHS/learn/sample/haru-receptionist/)
- [官方模型下载包](https://cubism.live2d.com/sample-data/bin/haru_greeter/haru_greeter_ja.zip)
- [Live2D Cubism 素材样本使用条件](https://www.live2d.com/zh-CHS/learn/sample/model-terms/)
- [Live2D 无偿提供素材使用授权协议](https://www.live2d.com/eula/live2d-free-material-license-agreement_cn.html)

使用、分发软件或公开演示前，必须确认项目使用者符合官方授权协议，并保留以下版权说明：

> This content uses sample data owned and copyrighted by Live2D Inc. The sample data are utilized in accordance with terms and conditions set by Live2D Inc. This content itself is created at the author’s sole discretion.

仓库仍保留 `assets/avatar/hiyori/` 作为旧的可选示例资源，但它不再是默认模型，也不会在课堂界面中作为 fallback 显示。Live2D Cubism Core 运行时位于：

```text
assets/avatar/runtime/live2dcubismcore.min.js
```

运行时授权说明见 [runtime/README.md](runtime/README.md)。
