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
  "bailian": {
    "workspaceId": "llm-xxx",
    "apiKey": "sk-xxx"
  },
  "userId": "classroom-student",
  "questions": [
    "《春》里“春风又绿江南岸”的“绿”用得好在哪里？",
    "请用一个生活中的例子解释什么是比喻。"
  ],
  "avatar": {
    "gender": "female",
    "models": {
      "female": "assets/avatar/teacher-female/Export/Business_Female_01_facial.fbx",
      "male": "assets/avatar/teacher-male/Export/Business_Male_01_facial.fbx"
    }
  }
}
```


字段：

|字段|说明|
|-|-|
|`coze.token`|Coze Personal Access Token，只在本地配置文件中保存|
|`coze.botId`|Coze 智能体 ID|
|`bailian.workspaceId`|百炼 Workspace ID，当前请求地域使用北京专属域名|
|`bailian.apiKey`|百炼 API Key，只在软件目录的本地配置文件中保存，不写入日志或提交记录|
|`userId`|发送给 Coze 的课堂用户标识，用于复用对话上下文|
|`questions`|语文课堂示例问题数组，设置页中每行一个|
|`avatar.gender`|当前教师性别，可选 `female` 或 `male`；在设置中切换后立即重新加载对应模型|
|`avatar.models.female`|女教师写实 3D 模型的本地 FBX 路径|
|`avatar.models.male`|男教师写实 3D 模型的本地 FBX 路径|

软件运行时会将配置解析为强类型结构；字段类型错误会直接显示启动错误，不会静默使用假配置。

百炼 Workspace ID 或 API Key 为空时，设置页和语音请求会明确提示缺少配置，不会回退到 Windows/macOS 系统语音，也不会返回假识别结果。API Key 输入框使用密码类型，百炼请求始终由 Electron 主进程发起。

两套模型使用 Microsoft Rocketbox 的职业人物资源，模型文件旁的 `Textures/` 目录必须一起保留。Three.js 通过本地 `tutor-assets` 协议读取 FBX 和 TGA 纹理。
