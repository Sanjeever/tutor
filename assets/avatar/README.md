# Live2D 模型资源

仓库已经附带 Live2D 官方免费示例角色“桃濑日和（Hiyori Momose）”，默认配置指向：

```
assets/avatar/hiyori/Hiyori.model3.json
```

模型文件来自 Live2D 官方 [CubismWebSamples](https://github.com/Live2D/CubismWebSamples) 的 `develop/Samples/Resources/Hiyori`，保持原始文件未修改。使用、分发软件或公开演示前，请阅读官方的[示例数据使用条件](https://www.live2d.com/zh-CHS/learn/sample/model-terms/)和[免费提供素材使用许可合同](https://www.live2d.com/eula/live2d-free-material-license-agreement_en.html)。官方要求保留以下版权说明：

> This content uses sample data owned and copyrighted by Live2D Inc. The sample data are utilized in accordance with terms and conditions set by Live2D Inc. This content itself is created at the author’s sole discretion.

如果要替换内置角色，可以把新的 Live2D 模型目录放在这里，并将 `config/config.json` 中的 `avatar.model` 设置为相对于软件目录的 `.model3.json` 路径，例如：

```json
{
  "avatar": {
    "model": "assets/avatar/your-model/your-model.model3.json"
  }
}
```

模型目录应包含 `.model3.json` 引用的纹理、动作和表情文件。仓库已经内置 Live2D Cubism Core Web 运行时：

```
assets/avatar/runtime/live2dcubismcore.min.js
```

运行时和模型均在本地加载，不依赖 CDN。Core 文件来自 Live2D 官方 Cubism Core Web 分发地址，使用和再分发时请遵守 Live2D Cubism SDK 的许可条款，详见 [runtime/README.md](runtime/README.md)。
