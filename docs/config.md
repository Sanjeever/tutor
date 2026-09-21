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
|`userId`|发送给 Coze 的课堂用户标识，用于复用对话上下文|
|`questions`|语文课堂示例问题数组，设置页中每行一个|
|`avatar.gender`|当前教师性别，可选 `female` 或 `male`；在设置中切换后立即重新加载对应模型|
|`avatar.models.female`|女教师写实 3D 模型的本地 FBX 路径|
|`avatar.models.male`|男教师写实 3D 模型的本地 FBX 路径|

软件运行时会将配置解析为强类型结构；字段类型错误会直接显示启动错误，不会静默使用假配置。

两套模型使用 Microsoft Rocketbox 的职业人物资源，模型文件旁的 `Textures/` 目录必须一起保留。Three.js 通过本地 `tutor-assets` 协议读取 FBX 和 TGA 纹理。
