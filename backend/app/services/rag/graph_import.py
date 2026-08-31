from __future__ import annotations

from dataclasses import dataclass
from itertools import combinations
import re
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.core.api_response import ApiError
from backend.app.models import RagChunk, RagDocument, RagDocumentVersion
from backend.app.services.rag.utils import json_loads, sha256_text


@dataclass(frozen=True)
class GraphTerm:
    name: str
    node_type: str
    aliases: tuple[str, ...]
    definition: str


TERM_CATALOG: tuple[GraphTerm, ...] = (
    GraphTerm("机器学习", "KnowledgePoint", ("machine learning", "ML"), "让模型从数据中学习规律并完成预测或决策。"),
    GraphTerm("监督学习", "KnowledgePoint", ("supervised learning",), "使用带标签样本训练模型的学习范式。"),
    GraphTerm("无监督学习", "KnowledgePoint", ("unsupervised learning",), "从无标签数据中发现结构或模式的学习范式。"),
    GraphTerm("模型评估", "KnowledgePoint", ("model evaluation",), "用指标和验证数据判断模型泛化表现。"),
    GraphTerm("过拟合", "Concept", ("overfitting",), "模型过度贴合训练集而泛化能力下降的现象。"),
    GraphTerm("正则化", "Method", ("regularization",), "通过约束模型复杂度降低过拟合风险的方法。"),
    GraphTerm("梯度下降", "Algorithm", ("gradient descent",), "沿损失函数负梯度方向迭代优化参数的算法。"),
    GraphTerm("损失函数", "Concept", ("loss function",), "衡量预测结果和真实目标差异的函数。"),
    GraphTerm("Python", "KnowledgePoint", ("python 程序设计",), "人工智能专业学习中的基础编程语言。"),
    GraphTerm("函数", "Concept", ("function", "def"), "封装可复用逻辑并通过参数和返回值交互的程序结构。"),
    GraphTerm("列表", "Concept", ("list",), "按顺序保存多个元素的 Python 基础容器。"),
    GraphTerm("字典", "Concept", ("dict", "dictionary"), "按键值对保存和查询数据的映射结构。"),
    GraphTerm("循环", "Concept", ("for", "while"), "重复执行一段逻辑的控制结构。"),
    GraphTerm("链表", "KnowledgePoint", ("linked list", "单链表"), "由节点通过指针或引用串联形成的线性结构。"),
    GraphTerm("头节点", "Concept", ("head node", "head 指针", "头指针"), "链表入口节点，删除或插入时常需要特殊处理。"),
    GraphTerm("指针", "Concept", ("pointer", "引用"), "指向节点或内存位置的连接信息。"),
    GraphTerm("栈", "KnowledgePoint", ("stack",), "遵循后进先出规则的线性结构。"),
    GraphTerm("队列", "KnowledgePoint", ("queue",), "遵循先进先出规则的线性结构。"),
    GraphTerm("括号匹配", "CodePattern", ("bracket matching",), "用栈检查括号嵌套和闭合顺序的经典模式。"),
    GraphTerm("二叉树", "KnowledgePoint", ("binary tree",), "每个节点最多有两个子节点的树形结构。"),
    GraphTerm("递归", "CodePattern", ("recursion", "recursive"), "函数直接或间接调用自身来分解问题的程序模式。"),
    GraphTerm("遍历", "Algorithm", ("traversal",), "按指定顺序访问数据结构中所有节点的过程。"),
    GraphTerm("前序遍历", "Algorithm", ("preorder",), "先访问根节点，再访问左子树和右子树的遍历顺序。"),
    GraphTerm("中序遍历", "Algorithm", ("inorder",), "先访问左子树，再访问根节点和右子树的遍历顺序。"),
    GraphTerm("后序遍历", "Algorithm", ("postorder",), "先访问左右子树，最后访问根节点的遍历顺序。"),
    GraphTerm("复杂度", "Concept", ("complexity", "time complexity", "space complexity"), "衡量算法时间或空间资源增长趋势的指标。"),
)

RELATION_RULES: dict[tuple[str, str], tuple[str, str]] = {
    ("机器学习", "监督学习"): ("CONTAINS", "机器学习课程主题包含监督学习。"),
    ("机器学习", "无监督学习"): ("CONTAINS", "机器学习课程主题包含无监督学习。"),
    ("机器学习", "模型评估"): ("CONTAINS", "模型训练后需要模型评估验证效果。"),
    ("过拟合", "正则化"): ("MITIGATED_BY", "正则化常用于缓解过拟合。"),
    ("损失函数", "梯度下降"): ("OPTIMIZED_BY", "梯度下降通常用于最小化损失函数。"),
    ("Python", "函数"): ("CONTAINS", "Python 程序设计包含函数基础。"),
    ("Python", "列表"): ("CONTAINS", "Python 程序设计包含列表容器。"),
    ("Python", "字典"): ("CONTAINS", "Python 程序设计包含字典容器。"),
    ("链表", "头节点"): ("CONTAINS", "头节点是链表边界处理的核心对象。"),
    ("链表", "指针"): ("USES", "链表通过指针或引用连接节点。"),
    ("栈", "括号匹配"): ("APPLIES_TO", "括号匹配是栈的典型应用。"),
    ("二叉树", "递归"): ("USES", "二叉树遍历常使用递归分解子树。"),
    ("递归", "遍历"): ("PREREQUISITE_OF", "理解递归有助于掌握树和图的遍历。"),
    ("二叉树", "前序遍历"): ("CONTAINS", "前序遍历是二叉树遍历方式之一。"),
    ("二叉树", "中序遍历"): ("CONTAINS", "中序遍历是二叉树遍历方式之一。"),
    ("二叉树", "后序遍历"): ("CONTAINS", "后序遍历是二叉树遍历方式之一。"),
}


def build_knowledge_graph_import_plan(db: Session, document_id: str, owner_id: str) -> dict[str, Any]:
    document = db.get(RagDocument, document_id)
    if document is None or document.deleted_at is not None:
        raise ApiError(404, "DOCUMENT_NOT_FOUND", "文档不存在")
    if document.owner_id != owner_id:
        raise ApiError(403, "KB_PERMISSION_DENIED", "无权访问该文档")
    if document.status != "READY" or not document.active_version_id:
        raise ApiError(409, "DOCUMENT_NOT_READY", "请先处理入库，再生成图谱导入预检")

    version = db.get(RagDocumentVersion, document.active_version_id)
    if version is None:
        raise ApiError(404, "DOCUMENT_VERSION_NOT_FOUND", "文档版本不存在")

    chunks = list(
        db.scalars(
            select(RagChunk)
            .where(
                RagChunk.document_id == document.id,
                RagChunk.document_version_id == version.id,
                RagChunk.enabled.is_(True),
            )
            .order_by(RagChunk.chunk_type.desc(), RagChunk.chunk_index.asc())
        )
    )
    parent_chunks = [chunk for chunk in chunks if chunk.chunk_type == "parent"]
    child_chunks = [chunk for chunk in chunks if chunk.chunk_type == "child"]
    if not child_chunks:
        raise ApiError(422, "NO_RETRIEVABLE_CHUNKS", "文档没有可用于图谱导入的检索切片")

    nodes = _candidate_nodes(document, version, child_chunks)
    edges = _candidate_edges(nodes)
    return {
        "document": {
            "id": document.id,
            "name": document.name,
            "knowledge_base_id": document.knowledge_base_id,
            "active_version_id": version.id,
            "status": document.status.lower(),
        },
        "import_policy": {
            "mode": "preview_only",
            "requires_confirmation": True,
            "auto_publish": False,
            "boundary": "只基于当前文档的 READY 子切片生成候选，不修改课程图谱或学生知识库。",
        },
        "segmentation": {
            "strategy": version.chunking_strategy,
            "cleaning_strategy": version.cleaning_strategy,
            "content_profile": json_loads(version.content_profile, {}),
            "source_layers": [
                {"layer": "document", "count": 1, "role": "原始资料与版本"},
                {"layer": "parent_chunk", "count": len(parent_chunks), "role": "章节级上下文"},
                {"layer": "evidence_chunk", "count": len(child_chunks), "role": "实体与关系抽取证据"},
                {"layer": "knowledge_candidate", "count": len(nodes), "role": "待确认知识节点"},
            ],
            "chunk_groups": _chunk_groups(parent_chunks, child_chunks),
        },
        "nodes": nodes,
        "edges": edges,
        "quality": _quality_report(nodes, edges, child_chunks),
        "market_reference_pattern": [
            "Document -> ParentChunk -> EvidenceChunk",
            "EvidenceChunk -> Entity/KnowledgePoint candidate",
            "Candidate -> Relation candidate",
            "Candidate -> human confirmation -> published graph",
        ],
    }


def _candidate_nodes(document: RagDocument, version: RagDocumentVersion, chunks: list[RagChunk]) -> list[dict[str, Any]]:
    found: dict[str, dict[str, Any]] = {}
    content_profile = json_loads(version.content_profile, {})
    for chunk in chunks:
        text = chunk.content
        matched_terms = _matched_catalog_terms(text)
        heading_name = _candidate_from_heading(json_loads(chunk.heading_path, []))
        if heading_name and not any(term.name == heading_name for term in matched_terms):
            matched_terms.append(GraphTerm(heading_name, "KnowledgePoint", (), f"由文档标题层级识别出的知识点：{heading_name}。"))
        for term in matched_terms:
            key = _node_key(term.name)
            evidence = _evidence_from_chunk(chunk, term.name)
            if key not in found:
                found[key] = {
                    "id": f"kgn_{sha256_text(document.id + ':' + key)[:16]}",
                    "name": term.name,
                    "type": term.node_type,
                    "definition": _definition_from_text(text, term.name) or term.definition,
                    "aliases": list(term.aliases),
                    "confidence": 0.76,
                    "source_chunk_ids": [],
                    "evidence": [],
                    "properties": {
                        "extraction_method": "rule_dictionary" if term.aliases or term.name in text else "heading_boundary",
                        "content_profile": content_profile.get("content_profile"),
                        "suggested_node_label": _node_label(term.node_type),
                    },
                }
            item = found[key]
            if chunk.id not in item["source_chunk_ids"]:
                item["source_chunk_ids"].append(chunk.id)
            if len(item["evidence"]) < 3:
                item["evidence"].append(evidence)
            item["confidence"] = min(0.94, 0.72 + 0.06 * len(item["source_chunk_ids"]))

    return sorted(found.values(), key=lambda item: (-len(item["source_chunk_ids"]), item["name"]))[:24]


def _candidate_edges(nodes: list[dict[str, Any]]) -> list[dict[str, Any]]:
    by_name = {node["name"]: node for node in nodes}
    edges: dict[str, dict[str, Any]] = {}

    for (source_name, target_name), (relation_type, rationale) in RELATION_RULES.items():
        if source_name in by_name and target_name in by_name:
            _add_edge(edges, by_name[source_name], by_name[target_name], relation_type, rationale, 0.86)

    for left, right in combinations(nodes, 2):
        shared = sorted(set(left["source_chunk_ids"]) & set(right["source_chunk_ids"]))
        if not shared:
            continue
        if len(edges) >= 30:
            break
        _add_edge(
            edges,
            left,
            right,
            "RELATED_TO",
            "两个候选知识点出现在同一证据切片中，需要人工确认具体关系。",
            0.64,
            evidence_chunk_ids=shared[:3],
        )

    return sorted(edges.values(), key=lambda item: (-item["confidence"], item["source"], item["target"]))[:30]


def _add_edge(
    edges: dict[str, dict[str, Any]],
    source: dict[str, Any],
    target: dict[str, Any],
    relation_type: str,
    rationale: str,
    confidence: float,
    *,
    evidence_chunk_ids: list[str] | None = None,
) -> None:
    edge_key = f"{source['id']}:{relation_type}:{target['id']}"
    if edge_key in edges:
        return
    evidence = evidence_chunk_ids
    if evidence is None:
        evidence = sorted(set(source["source_chunk_ids"]) & set(target["source_chunk_ids"]))[:3]
    edges[edge_key] = {
        "id": f"kge_{sha256_text(edge_key)[:16]}",
        "source": source["id"],
        "target": target["id"],
        "source_name": source["name"],
        "target_name": target["name"],
        "type": relation_type,
        "label": _relation_label(relation_type),
        "rationale": rationale,
        "confidence": confidence,
        "evidence_chunk_ids": evidence,
    }


def _matched_catalog_terms(text: str) -> list[GraphTerm]:
    lowered = text.lower()
    result = []
    for term in TERM_CATALOG:
        if term.name in text or any(alias.lower() in lowered for alias in term.aliases):
            result.append(term)
    return result


def _candidate_from_heading(heading_path: list[str]) -> str | None:
    for raw in reversed(heading_path):
        text = re.sub(r"^\s*(第[一二三四五六七八九十\d]+[章节讲]\s*)", "", raw)
        text = re.sub(r"^\s*\d+(?:\.\d+)*[.、)]?\s*", "", text).strip()
        text = re.sub(r"[:：]\s*$", "", text)
        if 2 <= len(text) <= 24 and not _looks_like_generic_heading(text):
            return text
    return None


def _looks_like_generic_heading(text: str) -> bool:
    generic = {"概述", "总结", "练习", "题目", "示例", "核心概念", "引用", "知识点"}
    return text in generic or text.lower() in {"overview", "summary", "exercise", "reference"}


def _definition_from_text(text: str, name: str) -> str | None:
    sentences = [item.strip() for item in re.split(r"(?<=[。！？!?；;])|\n+", text) if item.strip()]
    for sentence in sentences:
        if name in sentence and 12 <= len(sentence) <= 140:
            return sentence
    return None


def _evidence_from_chunk(chunk: RagChunk, term_name: str) -> dict[str, Any]:
    text = chunk.content
    index = text.find(term_name)
    if index < 0:
        excerpt = text[:180]
    else:
        start = max(0, index - 60)
        end = min(len(text), index + len(term_name) + 100)
        excerpt = text[start:end]
    return {
        "chunk_id": chunk.id,
        "chunk_index": chunk.chunk_index,
        "heading_path": json_loads(chunk.heading_path, []),
        "page_start": chunk.page_start,
        "page_end": chunk.page_end,
        "slide_start": chunk.slide_start,
        "slide_end": chunk.slide_end,
        "excerpt": excerpt,
    }


def _chunk_groups(parent_chunks: list[RagChunk], child_chunks: list[RagChunk]) -> list[dict[str, Any]]:
    children_by_parent: dict[str | None, list[RagChunk]] = {}
    for child in child_chunks:
        children_by_parent.setdefault(child.parent_chunk_id, []).append(child)
    groups = []
    for parent in parent_chunks:
        metadata = json_loads(parent.metadata_json, {})
        children = children_by_parent.get(parent.id, [])
        groups.append(
            {
                "parent_chunk_id": parent.id,
                "parent_index": parent.chunk_index,
                "heading_path": json_loads(parent.heading_path, []),
                "child_count": len(children),
                "child_chunk_ids": [child.id for child in children],
                "split_reason": metadata.get("split_reason"),
                "page_start": parent.page_start,
                "page_end": parent.page_end,
                "slide_start": parent.slide_start,
                "slide_end": parent.slide_end,
            }
        )
    if not groups:
        groups.append(
            {
                "parent_chunk_id": None,
                "parent_index": 0,
                "heading_path": [],
                "child_count": len(child_chunks),
                "child_chunk_ids": [child.id for child in child_chunks],
                "split_reason": "child_only",
                "page_start": None,
                "page_end": None,
                "slide_start": None,
                "slide_end": None,
            }
        )
    return groups


def _quality_report(nodes: list[dict[str, Any]], edges: list[dict[str, Any]], chunks: list[RagChunk]) -> dict[str, Any]:
    risks: list[str] = []
    if not nodes:
        risks.append("NO_NODE_CANDIDATES")
    if nodes and not edges:
        risks.append("NO_RELATION_CANDIDATES")
    weak_evidence = [node for node in nodes if len(node["source_chunk_ids"]) == 1 and node["confidence"] < 0.8]
    if len(weak_evidence) > max(2, len(nodes) // 2):
        risks.append("MANY_SINGLE_EVIDENCE_NODES")
    covered_chunks = {chunk_id for node in nodes for chunk_id in node["source_chunk_ids"]}
    coverage = len(covered_chunks) / max(1, len(chunks))
    if coverage < 0.35:
        risks.append("LOW_CHUNK_COVERAGE")
    return {
        "status": "PASSED" if not risks else "REVIEW_REQUIRED",
        "risk_flags": risks,
        "chunk_coverage": round(coverage, 3),
        "candidate_node_count": len(nodes),
        "candidate_edge_count": len(edges),
        "suggestion": "建议教师或学生确认节点命名与关系类型后再写入正式知识图谱。",
    }


def _node_key(name: str) -> str:
    return re.sub(r"\s+", " ", name).strip().lower()


def _node_label(node_type: str) -> str:
    labels = {
        "KnowledgePoint": "知识点",
        "Concept": "概念",
        "Method": "方法",
        "Algorithm": "算法",
        "CodePattern": "代码模式",
    }
    return labels.get(node_type, node_type)


def _relation_label(relation_type: str) -> str:
    labels = {
        "CONTAINS": "包含",
        "USES": "使用",
        "APPLIES_TO": "应用于",
        "PREREQUISITE_OF": "前置于",
        "MITIGATED_BY": "可缓解",
        "OPTIMIZED_BY": "可优化",
        "RELATED_TO": "相关",
    }
    return labels.get(relation_type, relation_type)
