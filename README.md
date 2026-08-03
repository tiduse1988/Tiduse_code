# AI投标系统

这是 AI 投标系统的前后端一体演示版本，包含：

- 前台项目上传、招标文件解析、投标文件生成、标书核验
- 后台首页、项目管理、账号管理
- DeepSeek API 调用
- Render 免费演示部署配置

## 本地启动

```bash
npm install
npm start
```

前台：

```text
http://localhost:8091/ai-bid/
```

后台：

```text
http://localhost:8091/ai-bid/admin.html
```

后台默认账号：

```text
admin / admin123
```

## 环境变量

参考 `.env.example`。

Render 部署时需要在平台环境变量中填写：

```text
DEEPSEEK_API_KEY=你的 DeepSeek Key
```

## 免费部署

Render 免费部署说明见：

```text
RENDER_DEPLOY.md
```

## 正式试用

正式试用建议接 Supabase 免费数据库和文件存储，方案见：

```text
SUPABASE_PLAN.md
```
