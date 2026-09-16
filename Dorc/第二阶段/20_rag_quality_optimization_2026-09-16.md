# RAG 检查、调研与优化记录（2026-09-16）

## 检查结论

范围是 `backend/app/services/rag/` 对应的学生知识库上传、解析、切分、索引、检索和引用链路。未将第一阶段文档作为产品依据，未扩展教师或管理员的独立检索系统。

本机最主要的问题不是缺少“RAG”接口，而是实际运行配置和算法质量：

| 原问题 | 后果 | 本轮修改 |
| --- | --- | --- |
| `.env` 使用 hash embedding、lexical reranker，知识库模型名却是 BGE-M3 | 无真正语义匹配，还容易误认为已使用真实模型 | 模型身份如实记录；本机启用 BGE-M3 与 BGE-reranker-v2-m3；hash 只保留测试向量用途，不参与语义召回 |
| 入库、查询、重处理直接读取全局 embedding 配置 | 修改环境配置后，查询向量可能与已有文档向量不在同一空间 | 从知识库读取 provider/model/dim，缓存也按完整配置区分；切换模型需要整库重建 |
| Markdown 按标题切分后父块不受长度限制；普通文本取所有分隔符中最靠后的一个 | 父块过长，句子边界优先级失效，字符重叠从句中开始 | 标题/页码/幻灯片范围、段落/句子/行边界优先；字符与估算 token 双预算；句子边界重叠 |
| 长代码退回普通字符切分，空行被当块边界，表格不重复表头 | 围栏不闭合、代码缩进/语句断裂、表格行丢失列语义 | 完整保留可容纳的代码块；长代码按行切分并补齐同种围栏；长表按行切分并重复表头 |
| 连续纯标题产生孤立碎片；跳级标题的同级关系错误 | 很短且不可单独回答问题的子块、章节路径错误 | 纯祖先标题与首个内容小节合并；按真实标题层级维护栈 |
| DOCX 先读完段落，再收集全部表格 | 表格被归到最后一章 | 按正文 XML 顺序读取段落和表格，保留所在标题 |
| SQLite 按词频计数；中文混合整句与单字；PostgreSQL simple 分词不能正确处理连续中文 | 常见字和长文淹没关键词；两种数据库召回行为分裂 | 中英文共用 analyzer：中文二/三元片段、独立单字、代码标识符；BM25 饱和词频与长度归一化 |
| RRF 原地累计分数；关键词重排再次覆盖融合顺序 | 重复调用不稳定，语义排名被规则覆盖 | 无副作用 RRF；规则模式保留融合顺序，真实模型负责重排 |
| 相邻重复子块挤满候选；无关查询也返回 hash 近邻 | 上下文来源单一，缺乏资料时硬回答 | 相同内容去重、父章节去重；真正的神经重排与阈值过滤 |
| 第一个父块可直接突破上下文预算 | 长文本挤占生成上下文 | 来源头也计入预算，优先保留命中的证据片段；引用 quote 来自实际送入模型的文本 |
| 候选数、重排数都填最终结果数量；未标注降级 | 无法判断检索阶段出了什么问题 | 返回真实候选数、稠密/词法命中数、模式、模型身份与降级警告；回答区分 model/extractive/insufficient_evidence |

## 调研依据与取舍

1. [Anthropic Contextual Retrieval](https://www.anthropic.com/engineering/contextual-retrieval)：切片的上下文会影响向量和词法召回。本轮将文件名、标题路径加入两种索引输入，正文与引用仍保存原文；未添加需要 LLM 生成的切片摘要。
2. [Microsoft Hybrid Search / RRF](https://learn.microsoft.com/en-us/azure/search/hybrid-search-ranking)：用排名融合组合词法与向量通道，避免直接相加不可比的原始分数。本轮沿用 RRF，修复原地累积分数，并加入候选去重和真实重排。
3. [Sentence Transformers Semantic Search](https://www.sbert.net/examples/sentence_transformer/applications/semantic-search/README.html)：区分查询和文档编码接口。本轮适配 `encode_query` / `encode_document`，旧版本库可回退 `encode`；使用真实 tokenizer 检查超长输入，避免静默截断。
4. [BGE-M3 模型说明](https://huggingface.co/BAAI/bge-m3) 与 [BGE Reranker 文档](https://bge-model.com/tutorial/5_Reranking/5.2.html)：保留现有 1024 维模型契约，使用多语言模型；重排分数明确经 sigmoid 映射到 0–1。

没有把结构规则切分称为模型语义切分，也没有把 hash、BM25 或 RRF 分数称为答案置信度。重排分数同样不代表经过校准的答案正确率。

## 当前实现与配置

- `chunking.py`：`structure_v2` 结构切分，保留来源 element 序号和准确的页/幻灯片范围。
- `embeddings.py`：批次条数、维度、有限值、非零向量检查及归一化；知识库配置固定；本地模型缓存可离线加载。
- `lexical.py`：BM25；SQLite 在当前知识库有效版本上计算；PostgreSQL 先用 GIN/统一 analyzer 的 OR 查询筛选候选，再在候选池上算 BM25。
- `retrieval.py`：有效版本/删除/禁用过滤、BGE + BM25、RRF、重复内容去重、神经重排、父章节去重；模型失败时明确降级到可用检索通道。
- `rag_service.py`：预算内证据上下文、来源头、可追溯 quote、无证据拒答、非法引用编号回退。
- `scripts/reindex_rag.py`：默认只预览。执行时为 SQLite 自动备份，创建新版本；一整个知识库处理成功后，在同一事务中切换活动版本和模型身份。失败不激活部分新版本，保留原索引。

本机已缓存并启用 `BAAI/bge-m3` 和 `BAAI/bge-reranker-v2-m3`。为避免启动检查远程仓库造成等待，本机开启 `CODETRACK_RAG_MODEL_LOCAL_FILES_ONLY=true`。新机器应先下载模型，再开启此选项；示例环境默认关闭。

本机重建涉及 2 个知识库，其中一个有 4 份已入库文档，另一个为空。所有 4 份文档的新切片已与当前源码重新生成的结果逐条核对一致。原文和历史版本未删除。备份与逐文档版本映射存于 `var/rag-backups/`，不纳入 Git。

| 当前活动索引 | 修改前 | 修改后 |
| --- | ---: | ---: |
| 子块数量 | 158 | 161 |
| 子块最大字符数 | 661 | 646 |
| 少于 80 字符的子块 | 56 | 13 |
| 父块数量 | 135 | 148 |

少量短块是独立短小节，未为追求长度而跨章节合并。子块长度包含用于检索的标题上下文，因此短块数量下降不能单独证明语义质量提升。

## 验证证据

全量 `python -m pytest -q`：**392 passed**。首次全量运行的提交诊断异步用例曾出现 404；独立复测及最后全量复测均通过。随后补充了非法/缺失模型引用的两项检查，最终 RAG 专项测试为 **49 passed**，覆盖结构、中文、向量校验、退化模式、预算、引用、重建成功/失败/历史版本保留，以及原有 API 链路。

隔离评测使用 `tests/fixtures/rag_eval.json`：12 篇人工编写课程资料，18 条可回答问题、2 条无资料问题，覆盖机器学习、Python 程序设计和数据结构。基线动态加载提交 `7b2106154a0a1640c049b821d044b2a3750bda06` 的原解析/切分/向量/检索算法，在独立内存数据库运行。所有模式使用相同文档和问题，不读取或改写应用数据库。

| 指标 | 原 hash + 词频重排 | 新 BM25 规则模式 | 新 BGE + BM25 + 神经重排 |
| --- | ---: | ---: | ---: |
| 首条命中 | 17/18 | 17/18 | 18/18 |
| 前三条命中 | 18/18 | 18/18 | 18/18 |
| MRR@6 | 0.9722 | 0.9722 | 1.0000 |
| 无资料时返回空结果 | 0/2 | 1/2 | 2/2 |

这是小型回归集，不是正式检索准确率、真实用户覆盖率或通用基准。此轮没有使用该集合做阈值寻优；神经重排使用已有默认阈值 0.15。应继续积累真实问法和人工相关性标注。

可复现命令：

```powershell
python -m pytest -q
python -m scripts.eval_rag --mode baseline --baseline-ref 7b2106154a0a1640c049b821d044b2a3750bda06 --output artifacts/rag/baseline.json
python -m scripts.eval_rag --mode lexical --output artifacts/rag/lexical.json
python -m scripts.eval_rag --mode semantic --output artifacts/rag/semantic.json
python -m scripts.reindex_rag --all
python -m scripts.reindex_rag --all --provider bge_m3 --model BAAI/bge-m3 --apply
```

评测明细与活动索引统计在 `artifacts/rag/`。模型推理运行于本机 CPU；小型语义评测平均约 5.5 秒/查询，不能把模型质量提升解释为速度提升。

运行中 API 的独立实测见 `artifacts/rag/live-smoke.json`：`hybrid_rrf+neural_rerank`，无降级警告；“SFT 与 RAG 分别承担什么作用”返回对应资料，“火星基地建设预算”返回空结果。在真实的 161 个子块上，重排 25–30 个候选时稳态约 22–23 秒，首次加载两模型约 53 秒。这是明确的 CPU 性能限制，尚不能称为低延迟服务；生产部署需要 GPU/独立推理服务与负载验证。

## 明确限制

- 本轮实际验证数据库为 SQLite；PostgreSQL 的 pgvector/GIN 路径已更新，但未进行真实 PostgreSQL 服务集成测试。GIN 候选池 BM25 与全库 BM25 的统计范围不同。
- SQLite 仍对授权知识库进行精确向量扫描和词法遍历，适合当前规模；大规模数据应使用 PostgreSQL 索引并做真实负载测试。
- 不对代码做语法树切分；超长代码按行分段。单行代码、单行表格若本身超限，会保留原行并标记 `atomic_overflow`；超过模型真实 token 上限会让入库明确失败，避免静默丢数据。
- PDF 仍主要依赖文本提取，没有新增扫描件 OCR、多栏版面还原、公式或图片理解。
- token 预算为保守估算；向量模型另用真实 tokenizer 校验，但回答模型未接入专属 tokenizer。
- 此次评测覆盖检索相关性，不等于证明生成答案事实完全正确。来源编号检查、引用文本和无证据拒答只解决其中一部分。
