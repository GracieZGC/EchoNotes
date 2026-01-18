# AI 笔记本输出报告

- 生成时间：2025-12-17 18:56:09
- 页面：`http://localhost:5173/analysis/v2/notebook_1765893091417_iunuydcu`
- 笔记本：`AI`（`notebook_1765893091417_iunuydcu`）
- 描述：AI 自动创建（科技AI应用）
- 笔记数：3
- 最近更新：2025-12-16T13:52:28.899Z

## 1. 笔记清单（本次分析输入）
| note_id | 标题 | updated_at |
|---|---|---|
| `note_1765893091425_koas373h` | 豆包手机助手：颠覆性AI体验  听全文 豆包手机助手：智能手机交互的新范式 1. 核心功能突破​ GUI Agent技术 | 2025-12-16T13:51:31.425Z |
| `note_1765892859674_3qai3wpv` | 黄仁勋：恐惧比野心更强大  听全文 黄仁勋作为NVIDIA创始人兼CEO，展现了极具个人特色的工作哲学与危机意识： 1. | 2025-12-16T13:52:23.522Z |
| `3.0` | 增长最快的 AI 应用诞生！千问 App 公测首周下载破 1000 万 | 2025-12-16T13:52:28.895Z |

## 2. AI 推荐图表（Analysis V2 / AI-Chart V3 流程）
该页面由 `frontend/src/components/AnalysisSettingV2Page.tsx` 驱动，核心流程如下：
1. 加载笔记本与笔记：`GET /api/notebooks`、`GET /api/notes?notebook_id=...`
2. 解析笔记本字段：从 `notebooks.component_config` 生成字段表（标题/正文/摘要/发布时间等）
3. 构建基础数据集：生成系统字段 `日期`，并统计字段缺失率
4. 调用 AI 推荐：`POST /api/ai-chart/recommend`（返回核心问题、推荐图表类型、字段计划）
5. 如有缺口字段：`POST /api/ai-chart/derive-fields` 生成字段值并回填数据集
6. 质量门槛（gates）降级：若时间字段缺失率过高/点数过少，则降级为柱状图等

### 2.1 数据质量（影响推荐与降级）
- `发布时间` 缺失率：1.00
- `笔记创建时间` 缺失率：0.67
（缺失率阈值来自页面 gates：`field_max_missing_rate = 0.4`）

### 2.2 本机可复现的推荐输出（示例运行）
- Run 1（source=llm）：`我收集的AI相关笔记在时间上的分布趋势是怎样的？`；推荐 `line`；最终 `bar`，X=`none`，Y=`count`；原因：字段缺失率过高，降级为频次柱状图
- Run 2（source=heuristic）：`最近记录/收集的频率如何变化？`；推荐 `line`；最终 `bar`，X=`发布时间`，Y=`count`；原因：字段缺失率过高，降级为频次柱状图
- Run 3（source=heuristic）：`最近记录/收集的频率如何变化？`；推荐 `line`；最终 `bar`，X=`发布时间`，Y=`count`；原因：字段缺失率过高，降级为频次柱状图

## 3. AI 字段表（analysis_v2_ai：情绪字段）
这部分来自数据库表 `ai_field_definitions` / `ai_field_values`（历史 AI 字段抽取结果）。

### 3.1 字段定义
| field_key | 名称 | 角色 | 类型 | source |
|---|---|---|---|---|
| `mood_category` | 情绪类别 | dimension | category | analysis_v2_ai |
| `mood_keywords` | 情绪关键词 | dimension | text | analysis_v2_ai |
| `mood_score` | 情绪分数 | metric | number | analysis_v2_ai |
| `mood_source` | 情绪来源 | dimension | category | analysis_v2_ai |

### 3.2 字段值（按笔记）
| note_id | 标题 | mood_category | mood_keywords | mood_score | mood_source |
|---|---|---|---|---|---|
| `note_1765893091425_koas373h` | 豆包手机助手：颠覆性AI体验  听全文 豆包手机助手：智能手机交互的新范式 1. 核心功能突破​ GUI Agent技术 | 消极 | 豆包手机,助手,颠覆性,体验,听全文,智能手机,交互的新,范式 | 3.0 | 工作 |
| `note_1765892859674_3qai3wpv` | 黄仁勋：恐惧比野心更强大  听全文 黄仁勋作为NVIDIA创始人兼CEO，展现了极具个人特色的工作哲学与危机意识： 1. | 消极 | 黄仁勋,恐惧比野,心更强大,听全文,黄仁勋作,创始人兼,展现了极,具个人特 | 3.0 | 工作 |
| `3.0` | 增长最快的 AI 应用诞生！千问 App 公测首周下载破 1000 万 | 中性 | 增长最快,应用诞生,千问,公测首周,下载破,Alibaba,assistant,Qianwen | 4.0 | 其他 |

