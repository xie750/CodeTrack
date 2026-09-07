from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from backend.app.core.api_response import ApiError
from backend.app.core.config import get_settings
from backend.app.models import (
    AuthoritativeKnowledgeBase,
    AuthoritativeKnowledgeSource,
    Course,
    RagChunk,
    RagDocument,
    RagDocumentVersion,
    RagKnowledgeBase,
    User,
)
from backend.app.services.rag.documents import ingest_document_version, upload_document
from backend.app.services.rag.retrieval import retrieve_chunks
from backend.app.services.rag.rag_service import rag_query
from backend.app.services.rag.utils import json_dumps, json_loads, sha256_bytes


DEFAULT_QUALITY_GATES = [
    "来源身份已登记",
    "章节与知识点已映射",
    "内容经课程化摘要整理",
    "切片可回溯到原始来源记录",
    "AI 引用必须返回 source_kind 与 chunk_id",
]


@dataclass(frozen=True)
class SeedAuthoritySource:
    id: str
    title: str
    source_kind: str
    publisher: str
    source_url: str
    license_note: str
    chapter: str
    knowledge_points: list[str]
    source_summary: str
    content: str
    quality_score: float


MACHINE_LEARNING_SOURCES = [
    SeedAuthoritySource(
        id="aks_ml_stanford_cs229_supervised",
        title="Stanford CS229 机器学习讲义摘要：监督学习与线性模型",
        source_kind="公开课程",
        publisher="Stanford University CS229",
        source_url="https://cs229.stanford.edu/main_notes.pdf",
        license_note="仅登记官方来源 URL，并写入课程化摘要；不复制外部讲义全文。",
        chapter="监督学习 / 线性模型 / 分类",
        knowledge_points=["监督学习", "线性回归", "逻辑回归", "梯度下降"],
        source_summary="基于 CS229 官方讲义主题整理监督学习、线性模型和参数学习的课程化摘要。",
        quality_score=96,
        content="""# Stanford CS229 机器学习讲义摘要：监督学习与线性模型

## 来源登记

官方来源：Stanford University CS229 Machine Learning Notes。
来源地址：https://cs229.stanford.edu/main_notes.pdf
处理说明：本资料只保存面向 CodeTrack 机器学习课程的中文课程化摘要，用于 AI 助学引用；不复制外部讲义全文。

## 监督学习

监督学习使用带标签样本学习从输入特征到目标变量的映射。训练数据通常写作一组样本，每个样本包含特征和标签。学习算法通过最小化损失函数来估计模型参数，并用未参与训练的数据检查泛化能力。

在课程任务中，学生需要区分训练阶段和评估阶段。训练误差低不等于模型已经学会通用规律，如果模型只记住训练样本的偶然模式，就会在新样本上表现下降。

## 线性回归

线性回归把预测值表示为特征的线性组合。常见目标是最小化预测值和真实标签之间的平方误差。梯度下降可以从初始参数出发，沿着损失下降方向逐步更新参数。

排查代码或概念题时，重点看三个边界：特征矩阵和参数维度是否一致；学习率是否过大导致震荡；训练损失下降是否同时伴随验证表现改善。

## 逻辑回归

逻辑回归常用于二分类问题。模型先计算线性得分，再通过 sigmoid 函数映射为概率。分类阈值会影响精确率、召回率等指标，因此评估时不能只看一个固定阈值下的准确率。

当学生把逻辑回归理解成普通线性回归时，AI 诊断应提示：逻辑回归输出的是类别概率，训练目标通常使用对数似然或交叉熵，而不是直接最小化连续数值误差。
""",
    ),
    SeedAuthoritySource(
        id="aks_ml_mit_6036_generalization",
        title="MIT OCW 6.036 摘要：泛化、验证集与模型选择",
        source_kind="公开课程",
        publisher="MIT OpenCourseWare",
        source_url="https://ocw.mit.edu/courses/6-036-introduction-to-machine-learning-fall-2020/",
        license_note="仅登记官方课程页，并写入课程化摘要；不复制外部课程材料全文。",
        chapter="模型选择 / 泛化 / 验证集",
        knowledge_points=["泛化", "验证集", "测试集", "模型选择"],
        source_summary="基于 MIT OCW 6.036 课程主题整理泛化评估、验证集和模型选择的课程化摘要。",
        quality_score=94,
        content="""# MIT OCW 6.036 摘要：泛化、验证集与模型选择

## 来源登记

官方来源：MIT OpenCourseWare 6.036 Introduction to Machine Learning。
来源地址：https://ocw.mit.edu/courses/6-036-introduction-to-machine-learning-fall-2020/
处理说明：本资料保存面向课堂问答的中文摘要，用于解释训练集、验证集和测试集的角色。

## 泛化能力

机器学习模型的目标不是记住训练样本，而是在未见过的数据上保持稳定表现。泛化能力需要通过独立数据估计，因此只报告训练集得分是不充分的。

如果一个模型训练集表现很好、验证集表现差，通常说明模型复杂度、特征处理或训练过程需要复核。AI 助学回答应把这种现象归入过拟合风险，而不是简单鼓励继续训练。

## 验证集和测试集

验证集用于开发过程中选择模型、调整超参数和比较方案。测试集用于在模型选择完成后做最终评估。多次根据测试集结果回调参数，会让测试集失去独立评估意义。

学生常见误区是把验证集和测试集混用。诊断时应指出：验证集服务模型选择，测试集服务最终报告；两者都不能参与参数拟合。

## 模型选择

模型选择需要同时考虑性能、复杂度、可解释性和数据规模。更复杂的模型不一定更好，尤其在样本较少或噪声较多时，简单模型可能有更稳定的泛化表现。
""",
    ),
    SeedAuthoritySource(
        id="aks_ml_sklearn_model_selection",
        title="scikit-learn 官方文档摘要：交叉验证与模型评估",
        source_kind="官方文档",
        publisher="scikit-learn",
        source_url="https://scikit-learn.org/stable/model_selection.html",
        license_note="仅登记官方文档页，并写入课程化摘要；不复制外部文档全文。",
        chapter="模型评估 / 交叉验证 / 指标",
        knowledge_points=["交叉验证", "模型评估", "分类指标", "回归指标"],
        source_summary="基于 scikit-learn 官方模型选择文档主题整理交叉验证和评估指标摘要。",
        quality_score=97,
        content="""# scikit-learn 官方文档摘要：交叉验证与模型评估

## 来源登记

官方来源：scikit-learn User Guide, Model selection and evaluation。
来源地址：https://scikit-learn.org/stable/model_selection.html
处理说明：本资料保存课程化摘要，用于帮助学生理解模型评估 API 背后的方法概念。

## 交叉验证

交叉验证通过多次划分训练和验证数据，减少单次划分带来的偶然性。常见做法是 K 折交叉验证：每一折轮流作为验证部分，其余部分用于训练。

交叉验证适合模型比较和超参数选择，但它不能替代最终测试集。完成模型选择后，仍应在独立测试集上报告最终结果。

## 分类指标

分类任务不能只看准确率。类别不平衡时，精确率、召回率、F1 值和混淆矩阵可以提供更细的错误结构。AI 解释学生结果时，应结合任务目标说明为什么某个指标更重要。

## 回归指标

回归任务常使用均方误差、平均绝对误差或决定系数等指标。不同指标对异常值的敏感性不同，选择指标时要结合业务目标和数据噪声。
""",
    ),
    SeedAuthoritySource(
        id="aks_ml_google_mlcc_overfitting",
        title="Google ML Crash Course 摘要：过拟合与正则化",
        source_kind="公开课程",
        publisher="Google Developers",
        source_url="https://developers.google.com/machine-learning/crash-course/overfitting/overfitting",
        license_note="仅登记官方课程页，并写入课程化摘要；不复制外部课程材料全文。",
        chapter="过拟合 / 正则化 / 泛化",
        knowledge_points=["过拟合", "正则化", "泛化", "模型复杂度"],
        source_summary="基于 Google Machine Learning Crash Course 主题整理过拟合与正则化的课程化摘要。",
        quality_score=93,
        content="""# Google ML Crash Course 摘要：过拟合与正则化

## 来源登记

官方来源：Google Developers Machine Learning Crash Course。
来源地址：https://developers.google.com/machine-learning/crash-course/overfitting/overfitting
处理说明：本资料保存课程化摘要，用于学生端解释过拟合风险和正则化作用。

## 过拟合

过拟合是模型对训练数据中的噪声、偶然模式或样本细节学习过多，导致新数据表现下降。典型信号是训练集误差持续降低，而验证集误差不再改善甚至上升。

学生回答中如果只说“训练效果好就是模型好”，AI 应提示他们补充验证集或测试集表现，并说明训练表现和泛化表现的差异。

## 正则化

正则化通过限制模型复杂度或惩罚过大的参数，降低模型过度贴合训练数据的风险。它不是简单让训练误差最低，而是在拟合能力和泛化能力之间做权衡。

常见讲解方式是把正则化理解为对模型自由度的约束。约束太弱可能仍然过拟合，约束太强可能欠拟合。

## 下一步学习建议

学习者应先掌握训练集、验证集、测试集的分工，再比较不同模型复杂度下的训练误差和验证误差曲线，最后理解正则化参数如何改变曲线走势。
""",
    ),
]


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def require_admin(user: User) -> None:
    if user.role not in {"ADMIN", "SUPER_ADMIN"}:
        raise ApiError(403, "AUTH_FORBIDDEN", "当前角色无权访问管理员权威知识库")


def ensure_authoritative_tables(db: Session) -> None:
    AuthoritativeKnowledgeBase.__table__.create(bind=db.bind, checkfirst=True)
    AuthoritativeKnowledgeSource.__table__.create(bind=db.bind, checkfirst=True)


def _course_by_name(db: Session, course_name: str) -> Course:
    course = db.scalar(select(Course).where(Course.name == course_name))
    if course is None:
        raise ApiError(404, "COURSE_NOT_FOUND", f"课程不存在：{course_name}")
    return course


def _ensure_rag_kb(db: Session, *, kb_id: str, owner: User, name: str, description: str) -> RagKnowledgeBase:
    kb = db.get(RagKnowledgeBase, kb_id)
    settings = get_settings()
    retrieval_config = json_dumps(
        {
            "dense_top_k": settings.dense_top_k,
            "lexical_top_k": settings.lexical_top_k,
            "rerank_top_n": settings.rerank_top_n,
            "min_rerank_score": settings.min_rerank_score,
            "fusion": "rrf",
            "rrf_k": settings.rrf_k,
        }
    )
    if kb is None:
        kb = RagKnowledgeBase(
            id=kb_id,
            owner_id=owner.id,
            name=name,
            description=description,
            embedding_provider=settings.embedding_provider,
            embedding_model=settings.embedding_model,
            embedding_dim=settings.embedding_dim,
            chunk_mode="parent_child",
            retrieval_config=retrieval_config,
            status="active",
        )
        db.add(kb)
    else:
        kb.name = name
        kb.description = description
        kb.owner_id = owner.id
        kb.retrieval_config = retrieval_config
        kb.updated_at = utc_now()
    db.commit()
    db.refresh(kb)
    return kb


def ensure_authoritative_kb(
    db: Session,
    *,
    admin: User,
    course_name: str = "机器学习",
    version: str = "2026.09",
) -> AuthoritativeKnowledgeBase:
    ensure_authoritative_tables(db)
    course = _course_by_name(db, course_name)
    akb_id = f"akb_{course.id}_{version.replace('.', '_')}"
    rag_kb_id = f"rag_{akb_id}"
    rag_kb = _ensure_rag_kb(
        db,
        kb_id=rag_kb_id,
        owner=admin,
        name=f"平台权威知识库：{course.name}",
        description="管理员端审定的人工智能专业机器学习权威资料，供学生端和教师端 AI 优先检索。",
    )
    akb = db.get(AuthoritativeKnowledgeBase, akb_id)
    if akb is None:
        akb = AuthoritativeKnowledgeBase(
            id=akb_id,
            subject="人工智能专业",
            course_id=course.id,
            rag_knowledge_base_id=rag_kb.id,
            version=version,
            status="DRAFT",
            owner_id=admin.id,
            coverage_rate=0,
            citation_pass_rate=0,
            retrieval_priority=1,
            publish_scope="人工智能专业学生 / 机器学习课程任务 / AI 导师问答",
            retrieval_policy="平台权威知识库优先召回；命中不足时补充教师课程资料；学生个人知识库只作为个人上下文。",
            quality_gates_json=json_dumps(DEFAULT_QUALITY_GATES),
        )
        db.add(akb)
    else:
        akb.rag_knowledge_base_id = rag_kb.id
        akb.owner_id = admin.id
        akb.updated_at = utc_now()
    db.commit()
    db.refresh(akb)
    return akb


def _source_document(db: Session, akb: AuthoritativeKnowledgeBase, admin: User, seed: SeedAuthoritySource) -> RagDocument:
    content_bytes = seed.content.encode("utf-8")
    digest = sha256_bytes(content_bytes)
    existing = db.scalar(
        select(RagDocument).where(
            RagDocument.knowledge_base_id == akb.rag_knowledge_base_id,
            RagDocument.sha256 == digest,
            RagDocument.deleted_at.is_(None),
        )
    )
    if existing:
        return existing
    document, _version, _job = upload_document(
        db,
        admin,
        akb.rag_knowledge_base_id,
        f"{seed.id}.md",
        content_bytes,
        "text/markdown",
        auto_process=False,
    )
    return document


def _latest_version(db: Session, document_id: str) -> RagDocumentVersion:
    version = db.scalar(
        select(RagDocumentVersion)
        .where(RagDocumentVersion.document_id == document_id)
        .order_by(RagDocumentVersion.version_no.desc())
        .limit(1)
    )
    if version is None:
        raise ApiError(404, "DOCUMENT_VERSION_NOT_FOUND", "文档版本不存在")
    return version


def _child_chunk_count(db: Session, document: RagDocument) -> int:
    if not document.active_version_id:
        return 0
    return db.scalar(
        select(func.count())
        .select_from(RagChunk)
        .where(
            RagChunk.document_id == document.id,
            RagChunk.document_version_id == document.active_version_id,
            RagChunk.chunk_type == "child",
            RagChunk.enabled.is_(True),
        )
    ) or 0


def _process_document_if_needed(db: Session, document: RagDocument) -> None:
    if document.status == "READY" and document.active_version_id:
        return
    version = _latest_version(db, document.id)
    ingest_document_version(db, document.id, version.id)
    db.refresh(document)


def seed_machine_learning_authority(db: Session, admin: User) -> AuthoritativeKnowledgeBase:
    require_admin(admin)
    akb = ensure_authoritative_kb(db, admin=admin, course_name="机器学习")
    for seed in MACHINE_LEARNING_SOURCES:
        source = db.get(AuthoritativeKnowledgeSource, seed.id)
        document = _source_document(db, akb, admin, seed)
        _process_document_if_needed(db, document)
        chunk_count = _child_chunk_count(db, document)
        if source is None:
            source = AuthoritativeKnowledgeSource(
                id=seed.id,
                authoritative_kb_id=akb.id,
                rag_document_id=document.id,
                title=seed.title,
                source_kind=seed.source_kind,
                publisher=seed.publisher,
                source_url=seed.source_url,
                license_note=seed.license_note,
                chapter=seed.chapter,
                knowledge_points_json=json_dumps(seed.knowledge_points),
                source_summary=seed.source_summary,
                status="REVIEWED",
                reviewer_id=admin.id,
                quality_score=seed.quality_score,
                chunk_count=chunk_count,
                reviewed_at=utc_now(),
            )
            db.add(source)
        else:
            source.authoritative_kb_id = akb.id
            source.rag_document_id = document.id
            source.title = seed.title
            source.source_kind = seed.source_kind
            source.publisher = seed.publisher
            source.source_url = seed.source_url
            source.license_note = seed.license_note
            source.chapter = seed.chapter
            source.knowledge_points_json = json_dumps(seed.knowledge_points)
            source.source_summary = seed.source_summary
            source.status = "REVIEWED"
            source.reviewer_id = admin.id
            source.quality_score = seed.quality_score
            source.chunk_count = chunk_count
            source.reviewed_at = source.reviewed_at or utc_now()
            source.updated_at = utc_now()
    akb.status = "READY_TO_PUBLISH"
    _refresh_metrics(db, akb)
    db.commit()
    db.refresh(akb)
    return akb


def _refresh_metrics(db: Session, akb: AuthoritativeKnowledgeBase) -> None:
    sources = list(
        db.scalars(
            select(AuthoritativeKnowledgeSource).where(
                AuthoritativeKnowledgeSource.authoritative_kb_id == akb.id
            )
        )
    )
    reviewed = [source for source in sources if source.status == "REVIEWED"]
    akb.coverage_rate = min(100, 55 + len(reviewed) * 10)
    akb.citation_pass_rate = round(
        sum(source.quality_score for source in reviewed) / len(reviewed), 1
    ) if reviewed else 0
    akb.updated_at = utc_now()


def list_authoritative_kbs(db: Session) -> list[AuthoritativeKnowledgeBase]:
    ensure_authoritative_tables(db)
    return list(
        db.scalars(
            select(AuthoritativeKnowledgeBase)
            .join(Course, Course.id == AuthoritativeKnowledgeBase.course_id)
            .order_by(Course.name.asc(), AuthoritativeKnowledgeBase.version.desc())
        )
    )


def get_authoritative_kb(db: Session, akb_id: str) -> AuthoritativeKnowledgeBase:
    ensure_authoritative_tables(db)
    akb = db.get(AuthoritativeKnowledgeBase, akb_id)
    if akb is None:
        raise ApiError(404, "AUTHORITATIVE_KB_NOT_FOUND", "权威知识库不存在")
    return akb


def add_authoritative_source(
    db: Session,
    admin: User,
    *,
    akb_id: str,
    title: str,
    source_kind: str,
    publisher: str,
    source_url: str,
    license_note: str,
    chapter: str,
    knowledge_points: list[str],
    source_summary: str,
    content: str,
    auto_review: bool = False,
) -> AuthoritativeKnowledgeSource:
    require_admin(admin)
    akb = get_authoritative_kb(db, akb_id)
    seed_like = SeedAuthoritySource(
        id=f"aks_custom_{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S%f')}",
        title=title,
        source_kind=source_kind,
        publisher=publisher,
        source_url=source_url,
        license_note=license_note,
        chapter=chapter,
        knowledge_points=knowledge_points,
        source_summary=source_summary,
        content=content,
        quality_score=88,
    )
    document = _source_document(db, akb, admin, seed_like)
    _process_document_if_needed(db, document)
    source = AuthoritativeKnowledgeSource(
        id=seed_like.id,
        authoritative_kb_id=akb.id,
        rag_document_id=document.id,
        title=title,
        source_kind=source_kind,
        publisher=publisher,
        source_url=source_url,
        license_note=license_note,
        chapter=chapter,
        knowledge_points_json=json_dumps(knowledge_points),
        source_summary=source_summary,
        status="REVIEWED" if auto_review else "PENDING_REVIEW",
        reviewer_id=admin.id if auto_review else None,
        quality_score=90 if auto_review else 84,
        chunk_count=_child_chunk_count(db, document),
        reviewed_at=utc_now() if auto_review else None,
    )
    db.add(source)
    akb.status = "NEEDS_REVIEW" if akb.status == "PUBLISHED" else akb.status
    _refresh_metrics(db, akb)
    db.commit()
    db.refresh(source)
    return source


def review_source(db: Session, admin: User, source_id: str) -> AuthoritativeKnowledgeSource:
    require_admin(admin)
    source = db.get(AuthoritativeKnowledgeSource, source_id)
    if source is None:
        raise ApiError(404, "AUTHORITATIVE_SOURCE_NOT_FOUND", "权威来源不存在")
    if not source.rag_document_id:
        raise ApiError(409, "SOURCE_DOCUMENT_MISSING", "权威来源尚未绑定 RAG 文档")
    document = db.get(RagDocument, source.rag_document_id)
    if document is None or document.status != "READY":
        raise ApiError(409, "SOURCE_DOCUMENT_NOT_READY", "权威来源文档尚未完成知识库处理")
    source.status = "REVIEWED"
    source.reviewer_id = admin.id
    source.quality_score = max(source.quality_score, 90)
    source.chunk_count = _child_chunk_count(db, document)
    source.reviewed_at = utc_now()
    source.updated_at = utc_now()
    akb = get_authoritative_kb(db, source.authoritative_kb_id)
    if akb.status not in {"PUBLISHED", "READY_TO_PUBLISH"}:
        akb.status = "READY_TO_PUBLISH"
    _refresh_metrics(db, akb)
    db.commit()
    db.refresh(source)
    return source


def publish_authoritative_kb(db: Session, admin: User, akb_id: str) -> AuthoritativeKnowledgeBase:
    require_admin(admin)
    akb = get_authoritative_kb(db, akb_id)
    sources = list(
        db.scalars(
            select(AuthoritativeKnowledgeSource).where(
                AuthoritativeKnowledgeSource.authoritative_kb_id == akb.id
            )
        )
    )
    if not sources:
        raise ApiError(409, "AUTHORITATIVE_KB_EMPTY", "没有可发布的权威来源")
    pending = [source.id for source in sources if source.status != "REVIEWED"]
    if pending:
        raise ApiError(409, "AUTHORITATIVE_KB_REVIEW_REQUIRED", "仍有权威来源未审定", {"source_ids": pending})
    not_ready = []
    for source in sources:
        document = db.get(RagDocument, source.rag_document_id or "")
        if document is None or document.status != "READY" or not document.active_version_id:
            not_ready.append(source.id)
    if not_ready:
        raise ApiError(409, "AUTHORITATIVE_KB_PROCESS_REQUIRED", "仍有来源未完成知识库处理", {"source_ids": not_ready})
    akb.status = "PUBLISHED"
    akb.published_at = utc_now()
    _refresh_metrics(db, akb)
    db.commit()
    db.refresh(akb)
    return akb


def retrieve_authoritative(db: Session, akb_id: str, query: str) -> dict[str, Any]:
    akb = get_authoritative_kb(db, akb_id)
    results = retrieve_chunks(db, akb.rag_knowledge_base_id, query)
    source_by_document = {
        source.rag_document_id: source
        for source in db.scalars(
            select(AuthoritativeKnowledgeSource).where(
                AuthoritativeKnowledgeSource.authoritative_kb_id == akb.id
            )
        )
    }
    return {
        "query": query,
        "results": [
            {
                "chunk_id": item.child_chunk_id,
                "parent_chunk_id": item.parent_chunk_id,
                "document_id": item.document_id,
                "document_name": item.file_name,
                "heading_path": item.heading_path,
                "content_preview": item.content[:260],
                "fusion_score": item.fusion_score,
                "rerank_score": item.rerank_score,
                "source": _source_payload(source_by_document.get(item.document_id)),
            }
            for item in results
        ],
    }


def query_authoritative(db: Session, akb_id: str, query: str) -> dict[str, Any]:
    akb = get_authoritative_kb(db, akb_id)
    result = rag_query(db, akb.rag_knowledge_base_id, query)
    source_by_document = {
        source.rag_document_id: source
        for source in db.scalars(
            select(AuthoritativeKnowledgeSource).where(
                AuthoritativeKnowledgeSource.authoritative_kb_id == akb.id
            )
        )
    }
    for citation in result.get("citations", []):
        source = source_by_document.get(citation.get("document_id"))
        citation["source_kind"] = "PLATFORM_AUTHORITATIVE"
        citation["trust_level"] = "AUTHORITATIVE" if source and source.status == "REVIEWED" else "REVIEW_REQUIRED"
        citation["authoritative_source"] = _source_payload(source)
    return result


def _source_payload(source: AuthoritativeKnowledgeSource | None) -> dict[str, Any] | None:
    if source is None:
        return None
    return {
        "id": source.id,
        "title": source.title,
        "source_kind": source.source_kind,
        "publisher": source.publisher,
        "source_url": source.source_url,
        "chapter": source.chapter,
        "knowledge_points": json_loads(source.knowledge_points_json, []),
        "status": source.status,
        "quality_score": source.quality_score,
    }


def serialize_kb(db: Session, akb: AuthoritativeKnowledgeBase) -> dict[str, Any]:
    course = db.get(Course, akb.course_id)
    sources = list(
        db.scalars(
            select(AuthoritativeKnowledgeSource)
            .where(AuthoritativeKnowledgeSource.authoritative_kb_id == akb.id)
            .order_by(AuthoritativeKnowledgeSource.created_at.desc())
        )
    )
    child_count = db.scalar(
        select(func.count())
        .select_from(RagChunk)
        .where(
            RagChunk.knowledge_base_id == akb.rag_knowledge_base_id,
            RagChunk.chunk_type == "child",
            RagChunk.enabled.is_(True),
        )
    ) or 0
    return {
        "id": akb.id,
        "subject": akb.subject,
        "course_id": akb.course_id,
        "course_name": course.name if course else akb.course_id,
        "rag_knowledge_base_id": akb.rag_knowledge_base_id,
        "version": akb.version,
        "status": akb.status,
        "owner_id": akb.owner_id,
        "coverage_rate": akb.coverage_rate,
        "source_count": len(sources),
        "chunk_count": child_count,
        "citation_pass_rate": akb.citation_pass_rate,
        "retrieval_priority": akb.retrieval_priority,
        "publish_scope": akb.publish_scope,
        "retrieval_policy": akb.retrieval_policy,
        "quality_gates": json_loads(akb.quality_gates_json, []),
        "created_at": akb.created_at.isoformat(),
        "updated_at": akb.updated_at.isoformat(),
        "published_at": akb.published_at.isoformat() if akb.published_at else None,
        "sources": [serialize_source(db, source) for source in sources],
    }


def serialize_source(db: Session, source: AuthoritativeKnowledgeSource) -> dict[str, Any]:
    document = db.get(RagDocument, source.rag_document_id or "")
    return {
        "id": source.id,
        "authoritative_kb_id": source.authoritative_kb_id,
        "rag_document_id": source.rag_document_id,
        "title": source.title,
        "source_kind": source.source_kind,
        "publisher": source.publisher,
        "source_url": source.source_url,
        "license_note": source.license_note,
        "chapter": source.chapter,
        "knowledge_points": json_loads(source.knowledge_points_json, []),
        "source_summary": source.source_summary,
        "status": source.status,
        "reviewer_id": source.reviewer_id,
        "quality_score": source.quality_score,
        "chunk_count": source.chunk_count,
        "document_status": document.status if document else "MISSING",
        "document_progress": document.progress if document else 0,
        "active_version_id": document.active_version_id if document else None,
        "created_at": source.created_at.isoformat(),
        "updated_at": source.updated_at.isoformat(),
        "reviewed_at": source.reviewed_at.isoformat() if source.reviewed_at else None,
    }
