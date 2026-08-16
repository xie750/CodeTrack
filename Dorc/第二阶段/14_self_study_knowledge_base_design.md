# 学生知识库初版设计

## 1. 文档目的

本文档只沉淀 CodeTrack 学生端“知识库”模块的初版设计。

后续如果要补充知识库创建、资料上传、文档处理、切片、索引、检索、引用、重试、权限等能力，优先在本文档中追加。

本文档不设计以下模块：

- 自主学习知识图谱；
- 教师端资料管理；
- 我的资料库；
- 学习产物生成；
- 课程任务资料；
- 多模态学习资料库。

这些模块可以与知识库在底层 AI 检索中协作，但在产品页面和业务概念上必须分开。

## 2. 模块定位

学生知识库是一个独立的一类页面，建议作为学生端侧边栏的一级或二级入口。

它的核心定位是：

```text
学生主动上传自己认为有价值的资料
-> 系统解析、清洗、切片、索引
-> 沉淀为学生自己的可检索知识库
-> AI 回答时可从知识库中检索依据
-> 回答展示可信标识和引用来源
```

知识库不是知识图谱。

知识库不是我的资料库。

知识库不是教师课程资料管理。

知识库的首要价值是：为 AI 提供可追溯、可引用、可检索的可信依据。

## 3. 模块边界

### 3.1 与知识图谱的边界

知识图谱是自主学习里的结构化知识关系模块，用于展示知识点之间的关系。

学生知识库是资料处理和检索模块，用于存放学生上传的资料。

两者页面、数据对象和业务流程都独立设计。

首版知识库文档不设计知识图谱的节点、边、前置关系和学习路径。

### 3.2 与教师资料的边界

教师上传的资料沉淀在教师端或课程资料体系中。

学生端知识库页面不展示教师资料管理控件，也不把教师资料当成学生知识库的一部分。

但在底层 AI 检索时，AI 可以同时参考：

```text
学生自己的知识库
+ 教师端已经发布或允许引用的可信资料
```

前端回答中可以展示引用来源，例如：

```text
来源：我的知识库 / 教师资料 / 平台资料
```

但学生知识库页面本身只管理学生自己上传的资料。

### 3.3 与我的资料库的边界

我的资料库用于保存学生生成或收藏的学习资料，例如：

- AI 生成的复习笔记；
- AI 生成的知识卡片；
- 错题总结；
- 思维导图；
- PPT 大纲；
- 后续多模态生成内容；
- 学生收藏的外部资料。

学生知识库用于处理可检索资料，让 AI 能引用和查找。

两者可以在后续互通，例如“将我的资料加入知识库”，但首版先保持概念独立。

### 3.4 与课程任务的边界

课程任务相关资料由教师端和任务系统维护。

学生知识库不依赖课程任务，也不要求绑定某一门课程。

学生上传资料时可以填写标签或说明，但不强制绑定课程、任务或知识点。

## 4. 设计原则

### 4.1 独立页面

知识库应有独立页面，不嵌在知识图谱、我的资料或课程任务页面里。

建议入口：

```text
学生端侧边栏
-> 知识库
```

### 4.2 学生主动构建

知识库资料来源以学生主动上传为主。

首版资料来源：

```text
UPLOAD_FILE
PASTED_TEXT
```

后续可扩展：

```text
WEB_CLIP
IMPORTED_ARTIFACT
AI_GENERATED_RESOURCE
```

### 4.3 服务 AI 可信检索

知识库不是为了堆文件，而是为了让 AI 回答更可信。

因此每份资料必须经过：

```text
上传
-> 解析
-> 清洗
-> 切片
-> 索引
-> 可检索
-> 可引用
```

### 4.4 SaaS 工作台风格

页面采用现代 SaaS / AI 工作区风格：

- 左侧或顶部为知识库列表和筛选；
- 主区域为文档列表、处理状态和检索测试；
- 右侧抽屉或详情面板展示文档详情、切片预览、引用预览；
- 状态、进度、失败原因和重试入口清晰可见；
- 不使用营销式首页；
- 不使用大面积装饰图形。

## 5. 页面形态

### 5.1 知识库首页

页面目标：

让学生快速看到自己有哪些知识库、哪些资料已经可用、哪些资料处理失败。

布局建议：

```text
顶部工具栏：
新建知识库 / 上传资料 / 搜索 / 状态筛选

主体：
知识库列表或卡片
文档处理概览
最近使用的知识库

右侧或抽屉：
知识库详情
```

知识库列表展示：

- 名称；
- 说明；
- 文档数量；
- 切片数量；
- 可检索状态；
- 最近更新时间；
- 最近一次失败原因摘要。

### 5.2 知识库详情页

页面目标：

管理某个知识库中的资料和处理状态。

布局建议：

```text
顶部：
知识库名称 / 状态 / 上传资料 / 检索测试 / 设置

中间：
文档列表

右侧详情面板：
文档详情 / 切片预览 / 处理日志 / 引用预览
```

文档列表展示：

- 文件名；
- 文件类型；
- 文件大小；
- 上传时间；
- 处理状态；
- 切片数量；
- 是否可检索；
- 失败原因；
- 重新处理；
- 删除。

### 5.3 上传资料面板

上传资料时展示：

- 选择文件；
- 粘贴文本；
- 资料标题；
- 资料说明；
- 标签；
- 处理方式说明；
- 开始上传按钮。

上传动作只保存原始资料，不自动进入解析、清洗、切片和索引。学生可能上传错文件，所以资料上传后应先进入“待处理”状态，并在文档列表中提供：

- 处理入库按钮；
- 删除按钮；
- 文件名、类型、大小和上传时间；
- 当前状态和处理进度。

只有学生点击“处理入库”后，系统才开始把该文档处理为可检索知识库内容。

首版支持：

```text
.md
.txt
```

根据依赖情况逐步支持：

```text
.pdf
.docx
```

### 5.4 处理状态面板

每个文档需要展示处理流程：

```text
已上传
-> 等待学生确认
-> 学生点击处理入库
-> 校验中
-> 解析中
-> 清洗中
-> 切片中
-> 索引中
-> 可检索
```

如果失败，展示：

- 失败步骤；
- 失败原因；
- 重新处理按钮；
- 删除按钮。

删除规则：

- 待处理文档删除时，只删除原始上传记录；
- 处理中原则上不允许删除，或需要后端先取消处理任务；
- 处理完成文档删除时，应同时软删除该文档生成的 chunk、索引和 embedding 记录，并更新知识库统计；
- 处理失败文档可以删除，也可以重新处理。

### 5.5 检索测试面板

学生可以在知识库详情页测试检索效果。

输入：

```text
检索问题或关键词
```

输出：

- 命中的文档；
- 命中的切片；
- 相似度或匹配分；
- 可作为 AI 引用的内容预览。

## 6. 用户业务流程

### 6.1 创建知识库

```text
学生打开知识库页面
-> 点击新建知识库
-> 填写名称、说明和标签
-> 创建成功
-> 进入知识库详情页
```

首版知识库只属于当前学生。

### 6.2 上传资料

```text
学生进入某个知识库
-> 点击上传资料
-> 选择文件或粘贴文本
-> 填写资料标题和标签
-> 提交
-> 后端保存原始资料
-> 前端展示“待处理”
-> 学生检查文件是否正确
-> 若上传错误，点击删除
-> 若确认无误，点击处理入库
-> 前端展示处理状态
```

上传与处理必须拆成两个业务动作：

```text
上传资料 = 保存原始文件 / 原始文本 + 创建文档记录
处理入库 = 解析 / 清洗 / 切片 / 索引 / 更新知识库统计
```

首版前端可以先用规则状态机模拟处理过程，但页面文案和按钮必须体现真实业务边界，不能让用户误以为上传后一定自动入库。

### 6.3 处理入库

```text
学生点击处理入库
-> 后端创建 KnowledgeBaseProcessingRun
-> 校验文档是否属于当前学生和当前知识库
-> 校验类型和大小
-> 提取文本
-> 清洗文本
-> 切片
-> 生成 metadata
-> 建立检索索引
-> 更新文档状态
-> 更新知识库统计
```

### 6.4 使用知识库问 AI

```text
学生在 AI 导师或自主学习中提问
-> 后端读取学生可用知识库
-> 检索相关切片
-> 同时可检索教师端可信资料
-> 组装引用上下文
-> 生成回答
-> 展示可信标识和引用来源
```

### 6.5 失败重试

```text
文档处理失败
-> 前端展示失败步骤和原因
-> 学生点击重新处理
-> 后端重新进入处理流程
-> 成功后变为可检索
```

## 7. 后端处理流程

### 7.1 文件校验

校验内容：

- 文件类型；
- 文件大小；
- 文件是否为空；
- 文件是否重复；
- 当前学生是否有权限写入该知识库。

文件重复判断建议使用：

```text
content_hash
```

### 7.2 文本提取

首版建议：

```text
.txt  -> 直接读取
.md   -> 读取 Markdown 文本并保留标题结构
.pdf  -> 后续接入解析器
.docx -> 后续接入解析器
```

文本提取输出：

```json
{
  "text": "……",
  "sections": [
    {
      "title": "链表删除",
      "text": "……",
      "page_number": null
    }
  ],
  "metadata": {
    "parser": "markdown",
    "char_count": 5200
  }
}
```

### 7.2.1 资料识别与策略路由

知识库处理不能只按一种固定规则切分。上传资料后应先做轻量文件识别，解析后再做内容画像识别，并据此选择清洗和切分策略。

推荐链路：

```text
上传
-> 基础文件识别
-> 等待学生确认 / 处理入库
-> 解析
-> 内容画像识别
-> 分类清洗
-> 分类切分
-> 向量化
-> 索引和召回
```

上传后的基础识别只判断文件容器和处理提示：

```text
markdown / plain_text / pdf / docx / pptx / unknown
```

解析后的内容画像才决定清洗和切分方式：

```text
sectioned_note  -> 标题型讲义、结构化笔记
plain_note      -> 普通纯文本笔记
code_exercise   -> 编程题、题解、算法笔记
table_heavy     -> 表格密集资料
slide_deck      -> PPT 课件
page_document   -> PDF 页式资料
mixed           -> 混合资料，按主要结构和元素类型兜底
```

首版策略保持轻量：

```text
section_recursive -> 标题 / 小节优先，过长再递归切
plain_recursive   -> 空行、换行、标点、空格递归切
code_aware        -> 保留代码块、题面、输入输出样例
table_aware       -> 表格尽量独立 chunk
slide_page        -> 以 slide 为 parent，再页内切
page_recursive    -> 以 page 为 parent，再页内切
```

识别结果应写入文档版本和 chunk metadata，便于前端展示、处理排查和后续策略迭代。

### 7.3 文本清洗

清洗规则：

- 合并连续空白；
- 去除无意义空行；
- 保留标题；
- 保留代码块；
- 保留列表；
- 保留输入输出样例；
- 限制单文档最大处理字符数。

不应清洗掉：

- C++ 代码；
- 算法伪代码；
- 公式；
- Markdown 标题；
- 题目说明；
- 输入输出格式。

### 7.4 切片规则

首版采用规则切片。

```text
优先按标题和小节切片
-> 小节过长时按长度切分
-> 切片之间保留少量 overlap
-> 每个 chunk 保留来源信息
```

建议默认参数：

```text
target_chunk_chars: 800-1200
max_chunk_chars: 1600
overlap_chars: 120-200
min_chunk_chars: 80
```

代码类资料处理要求：

- 不从函数中间强行切断；
- 代码块和解释尽量放在同一 chunk；
- 输入输出示例尽量和题目描述放在相邻 chunk。

### 7.5 元数据生成

每个 chunk 至少记录：

```text
knowledge_base_id
document_id
student_id
chunk_index
content
content_preview
section_title
page_number
keywords
tags
char_count
token_count
content_hash
```

首版标签可以来自：

- 学生手动填写；
- 文件名；
- 标题；
- 简单关键词匹配。

后续再引入 AI 自动标注。

### 7.6 索引

首版索引：

```text
数据库关键词检索
+ metadata 过滤
```

后续升级：

```text
embedding 向量检索
+ 关键词检索
+ metadata 过滤
+ 混合排序
```

SQLite 阶段可以先不落地向量字段，只保留 embedding 状态。

## 8. 状态设计

### 8.1 知识库状态

```text
DRAFT
PROCESSING
READY
PARTIAL_READY
FAILED
ARCHIVED
```

### 8.2 文档状态

```text
UPLOADED
VALIDATING
PARSING
CLEANING
CHUNKING
INDEXING
READY
FAILED
DELETED
```

### 8.3 切片状态

```text
READY
REINDEXING
FAILED
DELETED
```

### 8.4 embedding 状态

```text
PENDING
RUNNING
READY
SKIPPED
FAILED
```

如果没有接入 embedding，状态使用：

```text
SKIPPED
```

## 9. 数据对象

### 9.1 StudentKnowledgeBase

```text
id
student_id
title
description
tags
visibility
status
document_count
chunk_count
embedding_status
last_processed_at
created_at
updated_at
```

visibility 首版只支持：

```text
PRIVATE
```

### 9.2 StudentKnowledgeDocument

```text
id
knowledge_base_id
student_id
title
filename
file_ext
mime_type
size_bytes
storage_path
content_hash
source_type
tags
status
parse_status
chunk_status
embedding_status
chunk_count
error_message
created_at
updated_at
last_processed_at
```

source_type：

```text
UPLOAD_FILE
PASTED_TEXT
```

### 9.3 StudentKnowledgeChunk

```text
id
knowledge_base_id
document_id
student_id
chunk_index
content
content_preview
token_count
char_count
section_title
page_number
tags
keywords
metadata_json
status
created_at
updated_at
```

chunk id 建议稳定生成：

```text
document_id + chunk_index
```

### 9.4 StudentKnowledgeEmbedding

后续可选。

```text
id
chunk_id
knowledge_base_id
student_id
embedding_model
embedding_vector
status
created_at
updated_at
```

### 9.5 KnowledgeBaseProcessingRun

用于记录处理过程。

```text
id
knowledge_base_id
document_id
student_id
status
step
input_summary
output_summary
error_message
started_at
finished_at
```

## 10. 接口设计

### 10.1 创建知识库

```http
POST /api/v1/student/knowledge-bases
```

请求：

```json
{
  "title": "链表复习资料库",
  "description": "保存我自己整理的链表边界处理资料",
  "tags": ["链表", "复习"]
}
```

返回：

```json
{
  "knowledge_base_id": "skb_linked_list_review",
  "status": "DRAFT"
}
```

### 10.2 获取知识库列表

```http
GET /api/v1/student/knowledge-bases
```

返回：

```json
{
  "items": [
    {
      "knowledge_base_id": "skb_linked_list_review",
      "title": "链表复习资料库",
      "document_count": 3,
      "chunk_count": 28,
      "status": "READY",
      "updated_at": "2026-08-13T12:00:00"
    }
  ]
}
```

### 10.3 上传资料

```http
POST /api/v1/student/knowledge-bases/{knowledge_base_id}/documents
```

请求：

```text
multipart/form-data
file: 资料文件
title: 资料标题
tags: JSON 字符串数组
```

返回：

```json
{
  "document_id": "sdoc_linked_list_note",
  "status": "UPLOADED",
  "processing_status": "PARSING"
}
```

### 10.4 粘贴文本建资料

```http
POST /api/v1/student/knowledge-bases/{knowledge_base_id}/documents/from-text
```

请求：

```json
{
  "title": "链表错题整理",
  "content": "……",
  "tags": ["链表", "错题"]
}
```

### 10.5 查询处理状态

```http
GET /api/v1/student/knowledge-bases/{knowledge_base_id}/documents/{document_id}/status
```

返回：

```json
{
  "document_id": "sdoc_linked_list_note",
  "status": "READY",
  "parse_status": "READY",
  "chunk_status": "READY",
  "embedding_status": "SKIPPED",
  "chunk_count": 12,
  "error_message": null
}
```

### 10.5.1 触发文档处理入库

```http
POST /api/v1/student/knowledge-bases/{knowledge_base_id}/documents/{document_id}/process
```

用途：

学生确认资料上传无误后，手动触发解析、清洗、切片、索引流程。上传接口不能隐式调用该流程。

返回：

```json
{
  "document_id": "sdoc_linked_list_note",
  "processing_run_id": "kbrun_linked_list_note_001",
  "status": "PARSING"
}
```

约束：

- 只有文档状态为 `UPLOADED`、`FAILED` 或可重新处理状态时允许调用；
- 调用前必须校验 student_id、knowledge_base_id、document_id 的归属关系；
- 处理中重复调用应返回当前 processing_run，而不是创建多个并发处理任务；
- 文档处理成功后才更新 chunk_count、检索索引和知识库可检索统计。

### 10.6 查看切片

```http
GET /api/v1/student/knowledge-bases/{knowledge_base_id}/documents/{document_id}/chunks
```

返回：

```json
{
  "items": [
    {
      "chunk_id": "chunk_doc_001_0001",
      "chunk_index": 1,
      "content_preview": "删除头节点时，返回值必须指向新的头节点……",
      "section_title": "头节点删除",
      "page_number": null,
      "tags": ["链表"]
    }
  ]
}
```

### 10.7 检索测试

```http
POST /api/v1/student/knowledge-bases/{knowledge_base_id}/search
```

请求：

```json
{
  "query": "删除头节点为什么要返回新的头指针？",
  "top_k": 5
}
```

返回：

```json
{
  "items": [
    {
      "chunk_id": "chunk_doc_001_0003",
      "document_title": "链表错题整理",
      "content_preview": "……",
      "score": 0.78
    }
  ]
}
```

### 10.8 重新处理文档

```http
POST /api/v1/student/knowledge-bases/{knowledge_base_id}/documents/{document_id}/reprocess
```

### 10.9 删除文档

```http
DELETE /api/v1/student/knowledge-bases/{knowledge_base_id}/documents/{document_id}
```

删除时建议软删除：

```text
document status = DELETED
chunk status = DELETED
embedding status = DELETED
```

## 11. AI 检索使用方式

### 11.1 检索范围

AI 回答时可以检索：

```text
学生本人知识库
+ 教师端允许引用的可信资料
+ 平台内置公开资料
```

学生知识库页面只管理第一类。

教师资料和平台资料不在学生知识库页面里管理。

### 11.2 检索过滤

检索学生知识库时必须过滤：

```text
student_id = 当前学生
knowledge_base.status in READY / PARTIAL_READY
document.status = READY
chunk.status = READY
```

### 11.3 返回引用

AI 回答中的引用建议结构：

```json
{
  "source_kind": "STUDENT_KNOWLEDGE_BASE",
  "knowledge_base_id": "skb_linked_list_review",
  "document_id": "sdoc_linked_list_note",
  "chunk_id": "chunk_doc_001_0003",
  "title": "链表错题整理",
  "section_title": "头节点删除",
  "page_number": null
}
```

教师资料引用：

```json
{
  "source_kind": "TEACHER_RESOURCE",
  "source_id": "kb_teacher_linked_list",
  "title": "链表边界处理讲义"
}
```

前端可以用不同标签展示：

```text
我的知识库
教师资料
平台资料
```

但这些资料来源不合并到同一个知识库页面。

## 12. 与其他模块的关系

### 12.1 自主学习

自主学习可以调用知识库检索结果辅助 AI 讲解，但知识库页面不承担自主学习路径、知识图谱或练习推荐。

### 12.2 AI 导师

AI 导师可以检索学生知识库，并在回答中展示引用和可信标识。

### 12.3 我的资料

我的资料库保存学生生成、收藏或整理的学习产物。

后续可以支持：

```text
从我的资料导入知识库
```

但这属于后续互通能力，不是首版知识库的核心流程。

### 12.4 教师资料

教师资料可以作为 AI 的可信来源，但不在学生知识库页面中管理。

## 13. 前端开发清单

### 13.1 知识库页面

- 新增侧边栏入口“知识库”；
- 新增知识库列表；
- 新增新建知识库弹窗或抽屉；
- 新增知识库详情页；
- 新增上传资料面板；
- 新增文档处理状态；
- 新增失败重试入口；
- 新增切片预览；
- 新增检索测试。

### 13.2 AI 引用展示

- AI 回答展示“我的知识库”引用；
- AI 回答展示“教师资料”引用；
- 展示可信标识；
- 展示引用标题和片段预览；
- 不把教师资料管理入口放到学生知识库页面。

## 14. 后端开发清单

### 14.1 P0

- 新增 `StudentKnowledgeBase`；
- 新增 `StudentKnowledgeDocument`；
- 新增 `StudentKnowledgeChunk`；
- 新增 `KnowledgeBaseProcessingRun`；
- 新增知识库创建接口；
- 新增知识库列表接口；
- 新增文档上传接口；
- 新增粘贴文本接口；
- 新增文档处理入库触发接口；
- 新增文档处理状态接口；
- 新增切片查看接口；
- 新增检索测试接口；
- 新增文档重新处理接口；
- 新增文档删除接口；
- 新增 `.md` / `.txt` 解析；
- 新增文本清洗和切片服务；
- 新增关键词检索服务。

### 14.2 P1

- 支持 `.pdf`；
- 支持 `.docx`；
- 新增 embedding；
- 新增混合检索；
- 支持从我的资料导入知识库；
- 支持更完整的处理日志。

### 14.3 P2

- PostgreSQL + pgvector；
- 文档级权限扩展；
- 知识库共享；
- AI 自动标签；
- 多模态资料处理；
- 更细粒度引用定位。

## 15. 验收标准

第一版必须能演示：

```text
学生打开侧边栏“知识库”
-> 新建“链表复习资料库”
-> 上传一份 Markdown 或 TXT 资料
-> 前端看到“待处理”状态
-> 学生可以在处理前删除上传错的资料
-> 学生点击“处理入库”
-> 前端看到处理中
-> 后端完成解析、清洗、切片和索引
-> 前端看到 READY 状态和 chunk 数量
-> 学生进行检索测试
-> 命中上传资料中的切片
-> 学生向 AI 提问
-> AI 回答引用“我的知识库”中的资料
```

同时满足：

- 知识库不依赖课程任务；
- 知识库页面不展示知识图谱；
- 知识库页面不管理教师资料；
- 每个 chunk 绑定 student_id、knowledge_base_id 和 document_id；
- 其他学生无法访问该知识库；
- 文档处理失败可见原因；
- 支持重新处理；
- AI 回答能区分“我的知识库”和“教师资料”来源。

## 16. 后续补充模板

后续新增知识库能力时，在本节追加。

```text
### 能力名称

状态：
P0 / P1 / P2 / 暂缓

涉及页面：

涉及数据对象：

接口：

处理流程：

AI 使用方式：

安全边界：

验收标准：
```
