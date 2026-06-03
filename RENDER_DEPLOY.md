# Render 免费演示部署说明

## 部署目标

把当前 AI 投标系统部署到 Render 免费 Web Service，用于外部演示访问。

演示地址格式：

```text
https://你的服务名.onrender.com/AI投标/
https://你的服务名.onrender.com/AI投标/admin.html
```

## 免费演示版限制

Render 免费服务适合演示，不适合正式存数据：

- 空闲一段时间后会休眠，首次访问会慢一些。
- 本地 `data/db.json` 和 `data/uploads` 是临时文件，服务重启后可能丢失。
- 上传文件、账号、项目数据正式使用时应迁移到 Supabase。

## 部署前准备

1. 注册 GitHub。
2. 注册 Render。
3. 把本项目上传到 GitHub 仓库。
4. 不要上传 `.env`、`node_modules`、`data/db.json`、`data/uploads`。

当前 `.gitignore` 已经处理这些文件。

## Render 部署方式

推荐使用 Blueprint：

1. 打开 Render Dashboard。
2. 选择 `New`。
3. 选择 `Blueprint`。
4. 连接 GitHub 仓库。
5. Render 会读取项目根目录的 `render.yaml`。
6. 创建服务时填写环境变量 `DEEPSEEK_API_KEY`。

也可以手动创建 Web Service：

- Runtime: `Node`
- Build Command: `npm ci`
- Start Command: `npm start`
- Environment:
  - `PROJECT_BASE_PATH=AI投标`
  - `DEEPSEEK_BASE_URL=https://api.deepseek.com`
  - `DEEPSEEK_MODEL=deepseek-v4-flash`
  - `DEEPSEEK_API_KEY=你的 DeepSeek Key`

## 部署后验证

前台：

```text
https://你的服务名.onrender.com/AI投标/
```

后台：

```text
https://你的服务名.onrender.com/AI投标/admin.html
```

后台默认账号：

```text
admin / admin123
```

## 正式试用下一步

正式试用需要接 Supabase：

- Supabase Database：替代 `data/db.json`
- Supabase Storage：替代 `data/uploads`
- 后端保留当前接口路径，前端无需大改

迁移方案见 `SUPABASE_PLAN.md`。
