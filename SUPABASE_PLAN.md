# Supabase 正式试用接入方案

## 为什么要接 Supabase

Render 免费服务本地文件不适合长期保存。当前系统使用：

- `data/db.json` 保存账号、项目、解析结果
- `data/uploads` 保存上传的招标文件

正式试用应迁移到：

- Supabase PostgreSQL：保存账号、项目、解析结果、标书、核验结果
- Supabase Storage：保存招标文件、导出文件

## 免费版可承载的内容

Supabase 免费版适合 MVP 试用：

- 保存后台账号、前台账号
- 保存项目列表
- 保存解析报告 JSON
- 保存投标文件生成结果
- 保存核验报告结果
- 保存上传原文件

## 建议数据表

### users

| 字段 | 说明 |
| --- | --- |
| id | 用户 ID |
| account | 登录账号 |
| password_hash | 密码哈希 |
| name | 姓名 |
| role | admin 或 user |
| title | 职位 |
| enabled | 是否启用 |
| created_at | 创建时间 |

### projects

| 字段 | 说明 |
| --- | --- |
| id | 项目 ID |
| owner_id | 创建账号 |
| name | 项目名称 |
| file_name | 原文件名 |
| file_size | 文件大小 |
| file_path | Supabase Storage 文件路径 |
| status | 解析状态 |
| progress | 解析进度 |
| bid_status | 标书状态 |
| verification_status | 核验状态 |
| created_at | 创建时间 |
| updated_at | 更新时间 |

### results

| 字段 | 说明 |
| --- | --- |
| id | 结果 ID |
| project_id | 项目 ID |
| summary | 解析摘要 |
| extracted_items | 解析项数量 |
| risk_count | 风险数量 |
| raw | 完整解析 JSON |
| created_at | 创建时间 |
| updated_at | 更新时间 |

### bid_documents

| 字段 | 说明 |
| --- | --- |
| id | 标书 ID |
| project_id | 项目 ID |
| page_range | 页数档位 |
| outline_json | 目录 JSON |
| document_json | 标书正文 JSON |
| created_at | 创建时间 |

### verification_reports

| 字段 | 说明 |
| --- | --- |
| id | 核验 ID |
| project_id | 项目 ID |
| score | 核验分 |
| must_fix_count | 必须修复数量 |
| warning_count | 建议确认数量 |
| report_json | 核验报告 JSON |
| created_at | 创建时间 |

## 后端改造步骤

1. 安装 Supabase SDK。
2. 新增 `backend/storage.mjs`，封装数据库和文件存储。
3. 把 `readDb/writeDb` 替换为 Supabase 查询。
4. 把上传文件从本地 `data/uploads` 改成 Supabase Storage。
5. 下载接口从 Supabase Storage 读取文件。
6. 保留当前前端 API 路径，前端尽量不改。

## 需要你准备的信息

正式接 Supabase 时，需要：

```text
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_BUCKET=tender-files
```

这些不是服务器资源，是 Supabase 免费项目里的连接信息。
