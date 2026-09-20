# 配置说明

配置文件：

```
config/config.json
```


示例：

```json
{
  "coze": {
    "token": "pat_xxx",
    "botId": "xxx"
  },
  "userId": "classroom-student",
  "questions": [
    "《春》里“春风又绿江南岸”的“绿”用得好在哪里？",
    "请用一个生活中的例子解释什么是比喻。"
  ],
  "avatar": {
    "model": "assets/avatar/haru-greeter/haru_greeter_t05.model3.json"
  }
}
```


字段：

|字段|说明|
|-|-|
|`coze.token`|Coze Personal Access Token，只在本地配置文件中保存|
|`coze.botId`|Coze 智能体 ID|
|`userId`|发送给 Coze 的课堂用户标识，用于复用对话上下文|
|`questions`|语文课堂示例问题数组，设置页中每行一个|
|`avatar.model`|相对于软件目录的本地 `.model3.json` 路径，也可以填写绝对路径；默认使用内置 Haru 接待版本示例模型|

软件运行时会将配置解析为强类型结构；字段类型错误会直接显示启动错误，不会静默使用假配置。

仓库已内置 Live2D Cubism Core Web 运行时，路径为：

```
assets/avatar/runtime/live2dcubismcore.min.js
```
