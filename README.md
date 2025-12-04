# 个人网站项目

这是一个个人网站项目，包含前端和后端代码。

## 项目结构

```
个人网站/
├── recovery/
│   └── CLOUD_VERSION/
│       ├── backend/          # 后端代码
│       └── frontend/         # 前端代码
├── .gitignore               # Git 忽略文件
└── README.md                # 项目说明
```

## 连接到 GitHub

### 1. 在 GitHub 上创建新仓库

1. 访问 https://github.com/new
2. 输入仓库名称（例如：`personal-website`）
3. 选择 Public 或 Private
4. **不要**勾选 "Initialize this repository with a README"
5. 点击 "Create repository"

### 2. 添加远程仓库并推送

创建仓库后，使用以下命令连接并推送代码：

```bash
# 添加远程仓库（将 YOUR_USERNAME 和 REPO_NAME 替换为你的信息）
git remote add origin https://github.com/YOUR_USERNAME/REPO_NAME.git

# 推送代码到 GitHub
git branch -M main
git push -u origin main
```

### 3. 后续更新

每次修改代码后，使用以下命令更新 GitHub：

```bash
git add .
git commit -m "描述你的更改"
git push
```

## 注意事项

- `.env.local` 文件已添加到 `.gitignore`，不会被上传到 GitHub
- `node_modules` 目录不会被上传（如果存在）
- 敏感信息请保存在 `.env.local` 中，不要提交到 Git

