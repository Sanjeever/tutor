# 写实 3D 教师模型资源

应用内置两套 Microsoft Rocketbox 职业人物模型，由 Three.js `FBXLoader` 在本地加载：

| 性别 | 模型 | 主文件 |
| --- | --- | --- |
| 女老师 | Business Female 01 | `teacher-female/Export/Business_Female_01_facial.fbx` |
| 男老师 | Business Male 01 | `teacher-male/Export/Business_Male_01_facial.fbx` |

每个模型的 `Textures/` 目录包含 FBX 引用的本地 TGA 纹理，发布包中不能拆分或删除。模型使用了带面部数据的 facial 版本，包含 ARKit 风格的面部变形目标，应用目前使用 `JawOpen`、眨眼和微笑形变控制说话状态。

资源来源：

- [Microsoft Rocketbox Avatar Library](https://github.com/microsoft/Microsoft-Rocketbox)
- [Microsoft Rocketbox 项目说明](https://github.com/microsoft/Microsoft-Rocketbox/blob/master/README.md)

Microsoft Rocketbox 仓库在 2022 年将头像库更新为 MIT License。发布软件时请保留本说明和仓库中的许可证文件，并根据项目发布渠道再次核对上游许可文本。

模型通过本地 `tutor-assets` 协议加载，不从 CDN 下载资源。应用使用 Three.js（MIT License）完成渲染。
