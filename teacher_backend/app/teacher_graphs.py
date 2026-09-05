from __future__ import annotations

from collections import Counter
from datetime import datetime
import json
import math
import os
from pathlib import Path
import re
import uuid

import httpx
from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from .database import get_db
from .models import ClassGroup, TeacherGraphNodeAttachment, TeacherGraphPublication, TeacherKnowledgeGraph, User
from backend.app.core.database import build_engine
from backend.app.models import (
    AdministrativeClass as UnifiedClass,
    Base as UnifiedBase,
    Course as UnifiedCourse,
    StudentKnowledgeGraph as UnifiedStudentKnowledgeGraph,
    TeachingAssignment as UnifiedTeachingAssignment,
    User as UnifiedUser,
)
from backend.app.services.rag.chunking import BuiltChunk, build_parent_child_chunks
from backend.app.services.rag.cleaning import clean_elements
from backend.app.services.rag.parsers import SUPPORTED_EXTENSIONS, parse_document
from backend.app.services.rag.profiles import detect_content_profile, detect_file_profile
from backend.app.services.seed import seed_demo_data as seed_unified_demo_data


router = APIRouter(prefix="/teacher/knowledge-graphs", tags=["teacher-knowledge-graphs"])

NODE_TYPES = {"知识点", "概念", "方法", "公式", "案例", "能力"}
EDGE_TYPES = {"前驱", "后继", "相关"}
NODE_COLORS = {
    "知识点": "#2563eb",
    "概念": "#2563eb",
    "方法": "#0f766e",
    "公式": "#7c3aed",
    "案例": "#d97706",
    "能力": "#dc2626",
}
ALLOWED_SUFFIXES = SUPPORTED_EXTENSIONS
ATTACHMENT_UPLOAD_ROOT = Path(__file__).resolve().parents[1] / "uploads" / "graph-node-attachments"
ATTACHMENT_UPLOAD_ROOT.mkdir(parents=True, exist_ok=True)
ATTACHMENT_ALLOWED_SUFFIXES = {
    ".pdf", ".doc", ".docx", ".ppt", ".pptx", ".md", ".markdown", ".txt",
    ".png", ".jpg", ".jpeg", ".webp", ".csv", ".xlsx",
}
ATTACHMENT_MAX_BYTES = 50 * 1024 * 1024
WORKSPACE_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_UNIFIED_DATABASE_URL = f"sqlite:///{(WORKSPACE_ROOT / 'backend' / 'codetrack_dev.db').as_posix()}"
TEST_UNIFIED_DATABASE_URL = f"sqlite:///{(WORKSPACE_ROOT / 'backend' / 'codetrack_test.db').as_posix()}"
LEGACY_TO_UNIFIED_COURSE_IDS = {
    "course-ds": "course_ds_001",
    "course-py": "course_network_001",
    "course-ml": "course_arch_001",
}
LEGACY_TO_UNIFIED_CLASS_IDS = {
    "class-se1": "class_se_001",
    "class-se2": "class_cs_001",
}
LEGACY_TO_UNIFIED_TEACHER_IDS = {
    "teacher-01": "user_teacher_001",
    "teacher-02": "user_teacher_002",
}


class GraphNode(BaseModel):
    id: str = ""
    label: str = Field(min_length=1, max_length=32)
    type: str = "知识点"
    description: str = ""
    difficulty: int = 2
    x: float = 430
    y: float = 270
    color: str = "#2563eb"
    source: str = "custom"


class GraphEdge(BaseModel):
    id: str = ""
    source: str
    target: str
    type: str = "相关"
    label: str = "相关"


class GraphCreate(BaseModel):
    title: str = Field(default="未命名知识图谱", min_length=1, max_length=160)
    description: str = ""
    target_classes: list[str] = []
    nodes: list[GraphNode] = []
    edges: list[GraphEdge] = []


class GraphUpdate(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    description: str = ""
    target_classes: list[str] = []
    status: str = "draft"
    nodes: list[GraphNode] = []
    edges: list[GraphEdge] = []


class GraphPublish(BaseModel):
    class_ids: list[str] = Field(default_factory=list)


class GraphNodeAttachmentCreate(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    resource_type: str = Field(default="text", pattern="^(text|link)$")
    content: str = Field(default="", max_length=2000)
    link_url: str = Field(default="", max_length=500)
    visible: bool = True


class GraphNodeAttachmentUpdate(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    resource_type: str = Field(default="text", pattern="^(text|link)$")
    content: str = Field(default="", max_length=2000)
    link_url: str = Field(default="", max_length=500)
    visible: bool = True


class GraphNodeAttachmentCreateWithNode(GraphNodeAttachmentCreate):
    node_id: str = Field(min_length=1, max_length=80)


def now() -> datetime:
    return datetime.now().replace(microsecond=0)


def teacher_user(x_user_id: str = Header(default="teacher-01"), db: Session = Depends(get_db)) -> User:
    user = db.get(User, x_user_id)
    if not user or user.role != "teacher":
        raise HTTPException(status_code=403, detail="需要教师权限")
    return user


def graph_viewer(x_user_id: str | None = Header(default=None), db: Session = Depends(get_db)) -> User | None:
    if not x_user_id:
        return None
    user = db.get(User, x_user_id)
    if not user:
        raise HTTPException(status_code=401, detail="用户不存在")
    return user


def parse_json(value: str, fallback):
    try:
        parsed = json.loads(value or "")
        return parsed if isinstance(parsed, type(fallback)) else fallback
    except (TypeError, ValueError):
        return fallback


def normalize_name(value: str) -> str:
    return re.sub(r"\s+", "", value or "").lower()


def unified_database_url() -> str:
    explicit = os.getenv("CODETRACK_STUDENT_DATABASE_URL", "").strip()
    if explicit:
        return explicit
    current = os.getenv("CODETRACK_DATABASE_URL", "")
    if "teacher_backend" in current and "test_codetrack.db" in current:
        return TEST_UNIFIED_DATABASE_URL
    return DEFAULT_UNIFIED_DATABASE_URL


def open_unified_session() -> tuple[Session, object]:
    engine = build_engine(unified_database_url())
    UnifiedBase.metadata.create_all(bind=engine)
    local_session = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)
    return local_session(), engine


def graph_owner(db: Session, teacher: User, graph_id: int) -> TeacherKnowledgeGraph:
    item = db.get(TeacherKnowledgeGraph, graph_id)
    if not item or item.user_id != teacher.id:
        raise HTTPException(status_code=404, detail="图谱不存在")
    return item


def graph_publications(db: Session, graph_id: int) -> list[TeacherGraphPublication]:
    return db.scalars(
        select(TeacherGraphPublication)
        .where(TeacherGraphPublication.graph_id == graph_id, TeacherGraphPublication.status == "published")
        .order_by(TeacherGraphPublication.published_at.desc())
    ).all()


def serialize_publication(item: TeacherGraphPublication) -> dict:
    return {
        "id": item.id,
        "graph_id": item.graph_id,
        "class_id": item.class_id,
        "course_id": item.course_id,
        "class_name": item.class_name,
        "status": item.status,
        "published_at": item.published_at.isoformat(),
    }


def resolve_publish_classes(db: Session, teacher: User, class_ids: list[str]) -> list[ClassGroup]:
    requested = [value.strip() for value in class_ids if value.strip()]
    if not requested:
        raise HTTPException(status_code=422, detail="请选择至少一个发布班级")
    courses = db.scalars(select(ClassGroup).join(ClassGroup.course).where(ClassGroup.id.in_(requested))).all()
    by_id = {item.id: item for item in courses if item.course and item.course.teacher_id == teacher.id}
    missing = [class_id for class_id in requested if class_id not in by_id]
    if missing:
        raise HTTPException(status_code=404, detail=f"发布班级不存在或不属于当前教师：{', '.join(missing)}")
    unavailable = [item.name for item in by_id.values() if item.status == "closed"]
    if unavailable:
        raise HTTPException(status_code=422, detail=f"已结课班级不能接收新的图谱发布：{', '.join(unavailable)}")
    course_ids = {item.course_id for item in by_id.values()}
    if len(course_ids) > 1:
        raise HTTPException(status_code=422, detail="同一张图谱只能发布给同一门课程下的班级")
    return [by_id[class_id] for class_id in requested]


def graph_for_viewer(db: Session, user: User | None, graph_id: int) -> TeacherKnowledgeGraph:
    item = db.get(TeacherKnowledgeGraph, graph_id)
    if not item:
        raise HTTPException(status_code=404, detail="图谱不存在")
    if user is None:
        if item.status != "published":
            raise HTTPException(status_code=404, detail="图谱不存在")
        return item
    if user.role == "teacher":
        if item.user_id != user.id:
            raise HTTPException(status_code=404, detail="图谱不存在")
        return item
    if user.role == "student":
        if item.status != "published":
            raise HTTPException(status_code=404, detail="图谱不存在")
        return item
    raise HTTPException(status_code=403, detail="无权访问图谱")


def graph_node_ids(item: TeacherKnowledgeGraph) -> set[str]:
    return {str(node.get("id", "")).strip() for node in parse_json(item.nodes_json, []) if isinstance(node, dict) and node.get("id")}


def ensure_graph_node(item: TeacherKnowledgeGraph, node_id: str) -> None:
    if node_id not in graph_node_ids(item):
        raise HTTPException(status_code=404, detail="节点不存在")


def safe_file_name(filename: str) -> str:
    name = Path(filename or "attachment").name.strip() or "attachment"
    cleaned = re.sub(r"[^A-Za-z0-9._\-\u4e00-\u9fff]+", "_", name)
    return cleaned[:180] or "attachment"


def attachment_file_url(graph_id: int, node_id: str, attachment_id: str) -> str:
    return f"/api/v1/teacher/knowledge-graphs/{graph_id}/attachments/{attachment_id}/file"


def attachment_file_path(stored_name: str) -> Path:
    target = (ATTACHMENT_UPLOAD_ROOT / safe_file_name(stored_name)).resolve()
    root = ATTACHMENT_UPLOAD_ROOT.resolve()
    if target.parent != root:
        raise HTTPException(status_code=400, detail="文件路径无效")
    return target


def remove_attachment_file(item: TeacherGraphNodeAttachment) -> None:
    stored_name = getattr(item, "stored_name", "")
    if not stored_name:
        return
    try:
        attachment_file_path(stored_name).unlink(missing_ok=True)
    except OSError:
        pass


def serialize_attachment(item: TeacherGraphNodeAttachment) -> dict:
    return {
        "id": item.id,
        "graph_id": item.graph_id,
        "node_id": item.node_id,
        "title": item.title,
        "resource_type": item.resource_type,
        "content": item.content,
        "link_url": item.link_url,
        "file_name": getattr(item, "file_name", ""),
        "file_mime_type": getattr(item, "file_mime_type", ""),
        "file_size_bytes": getattr(item, "file_size_bytes", 0),
        "file_url": getattr(item, "file_url", ""),
        "visible": item.visible,
        "order_index": item.order_index,
        "created_at": item.created_at.isoformat(),
        "updated_at": item.updated_at.isoformat(),
    }


def node_attachments_by_graph(db: Session, graph_id: int, *, visible_only: bool = False) -> dict[str, list[dict]]:
    query = select(TeacherGraphNodeAttachment).where(TeacherGraphNodeAttachment.graph_id == graph_id)
    if visible_only:
        query = query.where(TeacherGraphNodeAttachment.visible.is_(True))
    rows = db.scalars(query.order_by(TeacherGraphNodeAttachment.node_id.asc(), TeacherGraphNodeAttachment.order_index.asc(), TeacherGraphNodeAttachment.created_at.asc())).all()
    grouped: dict[str, list[dict]] = {}
    for row in rows:
        grouped.setdefault(row.node_id, []).append(serialize_attachment(row))
    return grouped


def validate_attachment_payload(payload: GraphNodeAttachmentCreate | GraphNodeAttachmentUpdate) -> None:
    has_content = bool(payload.content.strip())
    has_link = bool(payload.link_url.strip())
    if payload.resource_type == "link" and not has_link:
        raise HTTPException(status_code=422, detail="链接类型需要填写链接地址")
    if payload.resource_type == "text" and not has_content:
        raise HTTPException(status_code=422, detail="文本类型需要填写知识内容")


def attachment_owner(
    db: Session,
    graph: TeacherKnowledgeGraph,
    node_id: str,
    attachment_id: str,
) -> TeacherGraphNodeAttachment:
    item = db.get(TeacherGraphNodeAttachment, attachment_id)
    if not item or item.graph_id != graph.id or item.node_id != node_id:
        raise HTTPException(status_code=404, detail="挂载知识不存在")
    return item


def serialize_graph(
    item: TeacherKnowledgeGraph,
    detail: bool = True,
    db: Session | None = None,
    *,
    visible_only_attachments: bool = False,
) -> dict:
    nodes = parse_json(item.nodes_json, [])
    edges = parse_json(item.edges_json, [])
    result = {
        "id": item.id,
        "title": item.title,
        "description": item.description,
        "status": item.status,
        "target_classes": parse_json(item.target_classes, []),
        "target_class_ids": [],
        "publications": [],
        "source_files": parse_json(item.source_files, []),
        "source_summary": item.source_summary,
        "node_count": len(nodes),
        "edge_count": len(edges),
        "created_at": item.created_at.isoformat(),
        "updated_at": item.updated_at.isoformat(),
        "published_at": item.published_at.isoformat() if item.published_at else "",
    }
    if db is not None:
        publications = graph_publications(db, item.id)
        if publications:
            result["publications"] = [serialize_publication(publication) for publication in publications]
            result["target_class_ids"] = [publication.class_id for publication in publications]
            result["target_classes"] = [publication.class_name or publication.class_id for publication in publications]
    if detail:
        attachments = node_attachments_by_graph(db, item.id, visible_only=visible_only_attachments) if db is not None else {}
        for node in nodes:
            if isinstance(node, dict):
                node["attachments"] = attachments.get(str(node.get("id", "")), [])
        result.update(nodes=nodes, edges=edges)
    return result


def unified_course_id(legacy_course_id: str) -> str:
    return LEGACY_TO_UNIFIED_COURSE_IDS.get(legacy_course_id, legacy_course_id)


def unified_class_id(legacy_class: ClassGroup) -> str | None:
    mapped = LEGACY_TO_UNIFIED_CLASS_IDS.get(legacy_class.id)
    if mapped:
        return mapped
    normalized = normalize_name(legacy_class.name)
    db, _ = open_unified_session()
    try:
        row = db.scalar(select(UnifiedClass).where(UnifiedClass.name == legacy_class.name))
        if row:
            return row.id
        rows = db.scalars(select(UnifiedClass)).all()
        for item in rows:
            if normalize_name(item.name) == normalized:
                return item.id
    finally:
        db.close()
    return None


def sync_graph_to_student_endpoint(
    graph: TeacherKnowledgeGraph,
    teacher: User,
    classes: list[ClassGroup],
    db: Session,
    published_at: datetime,
) -> list[dict]:
    synced: list[dict] = []
    teacher_id = LEGACY_TO_UNIFIED_TEACHER_IDS.get(teacher.id, teacher.id)
    nodes = serialize_graph(graph, db=db, visible_only_attachments=True)["nodes"]
    edges = parse_json(graph.edges_json, [])
    source_files = parse_json(graph.source_files, [])
    unified_db, _ = open_unified_session()
    try:
        if unified_db.get(UnifiedUser, teacher_id) is None:
            seed_unified_demo_data(unified_db)
            unified_db.commit()
        teacher_row = unified_db.get(UnifiedUser, teacher_id)
        if teacher_row is None:
            raise HTTPException(status_code=422, detail="学生端未找到对应教师账号，无法同步图谱")
        for legacy_class in classes:
            target_course_id = unified_course_id(legacy_class.course_id)
            target_class_id = unified_class_id(legacy_class)
            if not target_class_id:
                raise HTTPException(status_code=422, detail=f"学生端未找到对应班级：{legacy_class.name}")
            if unified_db.get(UnifiedCourse, target_course_id) is None:
                raise HTTPException(status_code=422, detail=f"学生端未找到对应课程：{legacy_class.course_id}")
            teaching = unified_db.scalar(
                select(UnifiedTeachingAssignment).where(
                    UnifiedTeachingAssignment.class_id == target_class_id,
                    UnifiedTeachingAssignment.course_id == target_course_id,
                    UnifiedTeachingAssignment.teacher_id == teacher_id,
                    UnifiedTeachingAssignment.status == "ACTIVE",
                )
            )
            if teaching is None:
                raise HTTPException(status_code=422, detail=f"学生端没有 {legacy_class.name} 的有效授课关系")
            graph_id = f"kg_tg_{graph.id}_{teaching.id}"[:64]
            target = unified_db.scalar(
                select(UnifiedStudentKnowledgeGraph).where(
                    UnifiedStudentKnowledgeGraph.teaching_assignment_id == teaching.id
                )
            )
            if target is None:
                target = UnifiedStudentKnowledgeGraph(
                    id=graph_id,
                    teaching_assignment_id=teaching.id,
                    class_id=target_class_id,
                    course_id=target_course_id,
                    teacher_id=teacher_id,
                    title=graph.title,
                    description=graph.description,
                    status="published",
                    target_classes="[]",
                    source_files="[]",
                    source_summary="",
                    nodes_json="[]",
                    edges_json="[]",
                    published_at=published_at,
                    updated_at=published_at,
                )
                unified_db.add(target)
            target.class_id = target_class_id
            target.course_id = target_course_id
            target.teacher_id = teacher_id
            target.title = graph.title
            target.description = graph.description
            target.status = "published"
            target.target_classes = json.dumps([legacy_class.name], ensure_ascii=False)
            target.source_files = json.dumps(source_files, ensure_ascii=False)
            target.source_summary = graph.source_summary
            target.nodes_json = json.dumps(nodes, ensure_ascii=False)
            target.edges_json = json.dumps(edges, ensure_ascii=False)
            target.published_at = published_at
            target.updated_at = published_at
            synced.append(
                {
                    "class_id": legacy_class.id,
                    "class_name": legacy_class.name,
                    "student_class_id": target_class_id,
                    "student_course_id": target_course_id,
                    "student_graph_id": target.id,
                }
            )
        unified_db.commit()
    finally:
        unified_db.close()
    return synced


def node_id() -> str:
    return f"node-{uuid.uuid4().hex[:8]}"


def edge_id() -> str:
    return f"edge-{uuid.uuid4().hex[:8]}"


def automatic_layout(nodes: list[dict]) -> list[dict]:
    if not nodes:
        return nodes
    nodes[0]["x"], nodes[0]["y"] = 430, 270
    count = max(1, len(nodes) - 1)
    for index, node in enumerate(nodes[1:]):
        angle = -math.pi / 2 + index * math.pi * 2 / count
        node["x"] = round(430 + 270 * math.cos(angle), 2)
        node["y"] = round(270 + 175 * math.sin(angle), 2)
    return nodes


def normalize_generated(payload: dict) -> tuple[str, list[dict], list[dict]]:
    raw_nodes = payload.get("nodes") if isinstance(payload, dict) else []
    raw_edges = payload.get("edges") if isinstance(payload, dict) else []
    nodes: list[dict] = []
    labels: dict[str, str] = {}
    for raw in raw_nodes if isinstance(raw_nodes, list) else []:
        if not isinstance(raw, dict):
            continue
        label = str(raw.get("label", "")).strip()[:32]
        if not label or label in labels:
            continue
        kind = str(raw.get("type", "知识点")).strip()
        kind = kind if kind in NODE_TYPES else "知识点"
        try:
            difficulty = int(raw.get("difficulty", 2))
        except (TypeError, ValueError):
            difficulty = 2
        difficulty = max(1, min(5, difficulty))
        supplied_id = str(raw.get("id", "")).strip()
        identifier = supplied_id[:80] if supplied_id else node_id()
        labels[label] = identifier
        labels[identifier] = identifier
        nodes.append({
            "id": identifier,
            "label": label,
            "type": kind,
            "description": str(raw.get("description", "")).strip()[:120],
            "difficulty": difficulty,
            "x": 430,
            "y": 270,
            "color": NODE_COLORS[kind],
            "source": "ai",
        })
        if len(nodes) >= 18:
            break
    edges: list[dict] = []
    seen: set[tuple[str, str, str]] = set()
    for raw in raw_edges if isinstance(raw_edges, list) else []:
        if not isinstance(raw, dict):
            continue
        source = labels.get(str(raw.get("source", "")).strip())
        target = labels.get(str(raw.get("target", "")).strip())
        kind = str(raw.get("type", "相关")).strip()
        if kind == "前置知识":
            kind = "前驱"
        if kind not in EDGE_TYPES:
            kind = "相关"
        key = (source or "", target or "", kind)
        if not source or not target or source == target or key in seen:
            continue
        seen.add(key)
        edges.append({"id": edge_id(), "source": source, "target": target, "type": kind, "label": kind})
        if len(edges) >= 32:
            break
    if len(nodes) > 1 and not edges:
        edges = [
            {"id": edge_id(), "source": nodes[index]["id"], "target": nodes[index + 1]["id"], "type": "前驱", "label": "前驱"}
            for index in range(len(nodes) - 1)
        ]
    description = str(payload.get("description", "") if isinstance(payload, dict) else "").strip()[:240]
    return description, automatic_layout(nodes), edges


def infer_type(label: str) -> str:
    if re.search(r"公式|定理|法则", label):
        return "公式"
    if re.search(r"方法|步骤|策略|算法", label):
        return "方法"
    if re.search(r"案例|例题|实践|项目", label):
        return "案例"
    if re.search(r"能力|目标|素养", label):
        return "能力"
    return "知识点"


def heuristic_graph(text: str, title: str) -> dict:
    lines = [re.sub(r"^[#\s\d.、（()）-]+", "", line).strip() for line in text.splitlines()]
    short_lines = [line[:32] for line in lines if 2 <= len(line) <= 32]
    words = re.findall(r"[\u4e00-\u9fff]{2,8}|[A-Za-z][A-Za-z0-9_+-]{2,24}", text)
    stop = {"以及", "可以", "进行", "一个", "我们", "使用", "通过", "相关", "内容", "课程", "学习", "知识"}
    frequent = [word for word, _ in Counter(word for word in words if word not in stop).most_common(24)]
    candidates = list(dict.fromkeys(([title.strip()] if title.strip() else []) + short_lines + frequent))
    while len(candidates) < 6:
        candidates.append(f"{title.strip() or '课程'}知识点 {len(candidates) + 1}")
    candidates = candidates[:14]
    nodes = [{
        "label": label[:32],
        "type": infer_type(label),
        "description": f"从课程资料中提取的“{label[:24]}”相关内容。",
        "difficulty": min(5, 1 + index // 3),
    } for index, label in enumerate(candidates)]
    halfway = max(1, (len(nodes) - 1) // 2)
    edges = [{
        "source": nodes[index]["label"],
        "target": nodes[index + 1]["label"],
        "type": "前驱" if index < halfway else "相关",
    } for index in range(len(nodes) - 1)]
    return {"description": f"根据上传资料生成的 {len(nodes)} 个知识节点。", "nodes": nodes, "edges": edges}


def _chunk_heading_candidate(chunk: BuiltChunk) -> str:
    for raw in reversed(chunk.heading_path or []):
        text = re.sub(r"^\s*(第[一二三四五六七八九十\d]+[章节讲]\s*)", "", raw)
        text = re.sub(r"^\s*\d+(?:\.\d+)*[.、)]?\s*", "", text).strip()
        text = re.sub(r"[:：]\s*$", "", text)
        if 2 <= len(text) <= 32 and text not in {"概述", "总结", "练习", "题目", "示例", "知识点"}:
            return text
    return ""


def heuristic_graph_from_chunks(chunks: list[BuiltChunk], text: str, title: str) -> dict:
    heading_candidates = [_chunk_heading_candidate(chunk) for chunk in chunks]
    heading_candidates = [item for item in heading_candidates if item]
    generated = heuristic_graph(text, title)
    nodes = generated.get("nodes", [])
    preferred = list(dict.fromkeys(([title.strip()] if title.strip() else []) + heading_candidates))
    if preferred:
        original_by_label = {str(node.get("label", "")): node for node in nodes if isinstance(node, dict)}
        merged: list[dict] = []
        for label in preferred:
            existing = original_by_label.get(label)
            merged.append(
                existing
                or {
                    "label": label[:32],
                    "type": infer_type(label),
                    "description": f"由资料章节边界识别出的“{label[:24]}”。",
                    "difficulty": min(5, 1 + len(merged) // 3),
                }
            )
        for node in nodes:
            if not isinstance(node, dict):
                continue
            label = str(node.get("label", "")).strip()
            if label and label not in {item["label"] for item in merged}:
                merged.append(node)
            if len(merged) >= 14:
                break
        generated["nodes"] = merged[:14]
        generated["edges"] = [
            {
                "source": generated["nodes"][index]["label"],
                "target": generated["nodes"][index + 1]["label"],
                "type": "前驱" if index < max(1, (len(generated["nodes"]) - 1) // 2) else "相关",
            }
            for index in range(len(generated["nodes"]) - 1)
        ]
    generated["description"] = f"复用资料解析与切分能力，根据 {len(chunks)} 个证据切片生成 {len(generated.get('nodes', []))} 个知识节点。"
    return generated


def extract_json_block(value: str) -> dict:
    value = value.strip()
    if value.startswith("```"):
        value = re.sub(r"^```(?:json)?\s*|\s*```$", "", value, flags=re.I)
    try:
        parsed = json.loads(value)
        return parsed if isinstance(parsed, dict) else {}
    except ValueError:
        match = re.search(r"\{.*\}", value, re.S)
        if not match:
            return {}
        try:
            parsed = json.loads(match.group(0))
            return parsed if isinstance(parsed, dict) else {}
        except ValueError:
            return {}


def llm_graph(text: str, title: str) -> dict | None:
    api_url = os.getenv("CODETRACK_LLM_API_URL", "").strip()
    api_key = os.getenv("CODETRACK_LLM_API_KEY", "").strip()
    if not api_url or not api_key:
        return None
    prompt = f"""你是课程知识图谱抽取器。只输出 JSON，不要 Markdown。根据资料抽取 8 到 16 个知识点及关系。
JSON 结构：{{"description":"一句话概括","nodes":[{{"label":"知识点","type":"概念|方法|公式|案例|能力","description":"不超过40字","difficulty":1}}],"edges":[{{"source":"节点名","target":"节点名","type":"前驱|后继|相关"}}]}}
图谱标题：{title}
课程资料：
{text[:6000]}"""
    try:
        response = httpx.post(
            api_url,
            headers={"Authorization": f"Bearer {api_key}"},
            json={"model": os.getenv("CODETRACK_LLM_MODEL", "gpt-4.1-mini"), "messages": [{"role": "user", "content": prompt}], "temperature": 0.2},
            timeout=45,
        )
        response.raise_for_status()
        data = response.json()
        content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
        return extract_json_block(content)
    except (httpx.HTTPError, ValueError, KeyError, TypeError):
        return None


def parse_uploaded_material(filename: str, content: bytes, mime_type: str | None) -> tuple[str, list[BuiltChunk], dict]:
    suffix = os.path.splitext(filename.lower())[1]
    if suffix not in ALLOWED_SUFFIXES:
        supported = "、".join(sorted(ALLOWED_SUFFIXES))
        raise HTTPException(status_code=415, detail=f"不支持的文件格式：{filename}；支持 {supported}")
    try:
        file_profile = detect_file_profile(filename, mime_type, content)
        parsed = parse_document(filename, content)
        content_profile = detect_content_profile(filename, parsed.elements)
        cleaned = clean_elements(parsed.elements, content_profile)
        groups = build_parent_child_chunks(cleaned, content_profile)
        child_chunks = [child for _, children in groups for child in children]
        evidence_chunks = child_chunks or [parent for parent, _ in groups]
        text = "\n\n".join(chunk.content for chunk in evidence_chunks if chunk.content.strip())
        source = {
            "filename": filename,
            "mime_type": mime_type or file_profile.mime_type or "application/octet-stream",
            "size_bytes": len(content),
            "parser": parsed.parser_name,
            "parser_version": parsed.parser_version,
            "file_type": file_profile.file_type,
            "content_profile": content_profile.content_profile,
            "cleaning_strategy": content_profile.cleaning_strategy,
            "chunking_strategy": content_profile.chunking_strategy,
            "element_count": len(parsed.elements),
            "cleaned_element_count": len(cleaned),
            "parent_chunk_count": len(groups),
            "child_chunk_count": len(child_chunks),
        }
        return text, evidence_chunks, source
    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(status_code=415, detail=f"不支持的文件格式：{filename}") from exc
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"无法解析文件：{filename}") from exc


@router.get("")
def list_graphs(teacher: User = Depends(teacher_user), db: Session = Depends(get_db)):
    items = db.scalars(select(TeacherKnowledgeGraph).where(TeacherKnowledgeGraph.user_id == teacher.id).order_by(TeacherKnowledgeGraph.updated_at.desc())).all()
    return {"data": [serialize_graph(item, detail=False, db=db) for item in items]}


@router.get("/{graph_id}")
def get_graph(graph_id: int, teacher: User = Depends(teacher_user), db: Session = Depends(get_db)):
    return {"data": serialize_graph(graph_owner(db, teacher, graph_id), db=db)}


@router.post("", status_code=201)
def create_graph(payload: GraphCreate, teacher: User = Depends(teacher_user), db: Session = Depends(get_db)):
    raw = payload.model_dump()
    nodes = raw["nodes"] or [{"label": "核心知识点", "type": "知识点", "description": "双击或在右侧面板中编辑节点内容。", "difficulty": 2, "x": 430, "y": 270, "color": "#2563eb", "source": "custom"}]
    _, nodes, edges = normalize_generated({"nodes": nodes, "edges": raw["edges"]})
    for node in nodes:
        node["source"] = "custom"
    item = TeacherKnowledgeGraph(user_id=teacher.id, title=payload.title.strip(), description=payload.description.strip(), target_classes=json.dumps(payload.target_classes, ensure_ascii=False), nodes_json=json.dumps(nodes, ensure_ascii=False), edges_json=json.dumps(edges, ensure_ascii=False))
    db.add(item); db.commit(); db.refresh(item)
    return {"data": serialize_graph(item, db=db)}


@router.post("/from-files", status_code=201)
async def create_graph_from_files(files: list[UploadFile] = File(...), title: str = Form(...), description: str = Form(""), target_classes: str = Form(""), teacher: User = Depends(teacher_user), db: Session = Depends(get_db)):
    if not files:
        raise HTTPException(status_code=422, detail="请至少上传一份资料")
    text_parts: list[str] = []
    evidence_chunks: list[BuiltChunk] = []
    sources: list[dict] = []
    for upload in files:
        content = await upload.read()
        if len(content) > 20 * 1024 * 1024:
            raise HTTPException(status_code=413, detail=f"文件超过 20 MB：{upload.filename}")
        filename = upload.filename or "资料.txt"
        extracted_text, chunks, source = parse_uploaded_material(filename, content, upload.content_type)
        text_parts.append(extracted_text)
        evidence_chunks.extend(chunks)
        sources.append(source)
    combined = "\n\n".join(text_parts)[:6000]
    if not combined.strip():
        raise HTTPException(status_code=422, detail="未能从上传资料中提取有效文本")
    generated = llm_graph(combined, title) or heuristic_graph_from_chunks(evidence_chunks, combined, title)
    summary, nodes, edges = normalize_generated(generated)
    if sources:
        parent_count = sum(int(source.get("parent_chunk_count", 0)) for source in sources)
        child_count = sum(int(source.get("child_chunk_count", 0)) for source in sources)
        summary = f"{summary} 已复用资料解析、清洗与父子切分能力：{parent_count} 个父切片、{child_count} 个证据切片。"
    classes = [value.strip() for value in re.split(r"[,，\n]+", target_classes) if value.strip()]
    item = TeacherKnowledgeGraph(user_id=teacher.id, title=title.strip() or "资料知识图谱", description=description.strip(), target_classes=json.dumps(classes, ensure_ascii=False), source_files=json.dumps(sources, ensure_ascii=False), source_summary=summary, nodes_json=json.dumps(nodes, ensure_ascii=False), edges_json=json.dumps(edges, ensure_ascii=False))
    db.add(item); db.commit(); db.refresh(item)
    return {"data": serialize_graph(item, db=db)}


@router.put("/{graph_id}")
def update_graph(graph_id: int, payload: GraphUpdate, teacher: User = Depends(teacher_user), db: Session = Depends(get_db)):
    item = graph_owner(db, teacher, graph_id)
    _, nodes, edges = normalize_generated({"nodes": [node.model_dump() for node in payload.nodes], "edges": [edge.model_dump() for edge in payload.edges]})
    supplied_nodes = {node.label: node for node in payload.nodes}
    for node in nodes:
        supplied = supplied_nodes.get(node["label"])
        if supplied:
            node.update(id=supplied.id or node["id"], x=supplied.x, y=supplied.y, source=supplied.source if supplied.source in {"ai", "custom"} else "custom")
    id_by_label = {node["label"]: node["id"] for node in nodes}
    original_by_key = {(edge.source, edge.target, edge.type): edge for edge in payload.edges}
    for edge in edges:
        supplied = original_by_key.get((edge["source"], edge["target"], edge["type"]))
        if supplied and supplied.id:
            edge["id"] = supplied.id
    kept_node_ids = {node["id"] for node in nodes}
    stale_attachments = db.scalars(
        select(TeacherGraphNodeAttachment).where(TeacherGraphNodeAttachment.graph_id == item.id)
    ).all()
    for attachment in stale_attachments:
        if attachment.node_id not in kept_node_ids:
            remove_attachment_file(attachment)
            db.delete(attachment)
    item.title = payload.title.strip(); item.description = payload.description.strip(); item.target_classes = json.dumps(payload.target_classes, ensure_ascii=False); item.status = payload.status if payload.status in {"draft", "published"} else "draft"; item.nodes_json = json.dumps(nodes, ensure_ascii=False); item.edges_json = json.dumps(edges, ensure_ascii=False); item.updated_at = now()
    if item.status == "published" and not item.published_at:
        item.published_at = now()
    db.commit()
    return {"data": serialize_graph(item, db=db)}


def create_attachment_record(
    db: Session,
    graph: TeacherKnowledgeGraph,
    node_id: str,
    payload: GraphNodeAttachmentCreate,
) -> TeacherGraphNodeAttachment:
    ensure_graph_node(graph, node_id)
    validate_attachment_payload(payload)
    order_index = len(db.scalars(select(TeacherGraphNodeAttachment).where(TeacherGraphNodeAttachment.graph_id == graph.id, TeacherGraphNodeAttachment.node_id == node_id)).all())
    item = TeacherGraphNodeAttachment(
        id=f"attach-{uuid.uuid4().hex[:10]}",
        graph_id=graph.id,
        node_id=node_id,
        title=payload.title.strip(),
        resource_type=payload.resource_type,
        content=payload.content.strip(),
        link_url=payload.link_url.strip(),
        visible=payload.visible,
        order_index=order_index,
    )
    db.add(item)
    graph.updated_at = now()
    db.commit()
    db.refresh(item)
    return item


@router.post("/{graph_id}/attachments", status_code=201)
def create_graph_attachment(
    graph_id: int,
    payload: GraphNodeAttachmentCreateWithNode,
    teacher: User = Depends(teacher_user),
    db: Session = Depends(get_db),
):
    graph = graph_owner(db, teacher, graph_id)
    item = create_attachment_record(db, graph, payload.node_id, payload)
    return {"data": serialize_attachment(item)}


@router.post("/{graph_id}/nodes/{node_id}/attachments", status_code=201)
def create_node_attachment(
    graph_id: int,
    node_id: str,
    payload: GraphNodeAttachmentCreate,
    teacher: User = Depends(teacher_user),
    db: Session = Depends(get_db),
):
    graph = graph_owner(db, teacher, graph_id)
    item = create_attachment_record(db, graph, node_id, payload)
    return {"data": serialize_attachment(item)}


def create_file_attachment_record(
    db: Session,
    graph: TeacherKnowledgeGraph,
    node_id: str,
    file: UploadFile,
    title: str = "",
    visible: bool = True,
) -> TeacherGraphNodeAttachment:
    ensure_graph_node(graph, node_id)
    original_name = file.filename or "attachment"
    suffix = Path(original_name).suffix.lower()
    if suffix not in ATTACHMENT_ALLOWED_SUFFIXES:
        raise HTTPException(status_code=400, detail="暂不支持该文件类型")

    attachment_id = f"attach-{uuid.uuid4().hex[:10]}"
    stored_name = f"{uuid.uuid4().hex}-{safe_file_name(original_name)}"
    target = attachment_file_path(stored_name)
    size = 0
    try:
        with target.open("wb") as output:
            while True:
                chunk = file.file.read(1024 * 1024)
                if not chunk:
                    break
                size += len(chunk)
                if size > ATTACHMENT_MAX_BYTES:
                    output.close()
                    target.unlink(missing_ok=True)
                    raise HTTPException(status_code=413, detail="挂载文件不能超过 50MB")
                output.write(chunk)
    finally:
        file.file.close()

    if size == 0:
        target.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail="不能上传空文件")

    order_index = len(db.scalars(select(TeacherGraphNodeAttachment).where(TeacherGraphNodeAttachment.graph_id == graph.id, TeacherGraphNodeAttachment.node_id == node_id)).all())
    item = TeacherGraphNodeAttachment(
        id=attachment_id,
        graph_id=graph.id,
        node_id=node_id,
        title=(title.strip() or original_name)[:120],
        resource_type="file",
        content="",
        link_url="",
        file_name=original_name[:220],
        file_mime_type=(file.content_type or "application/octet-stream")[:120],
        file_size_bytes=size,
        file_url=attachment_file_url(graph.id, node_id, attachment_id),
        stored_name=stored_name,
        visible=visible,
        order_index=order_index,
    )
    db.add(item)
    graph.updated_at = now()
    db.commit()
    db.refresh(item)
    return item


@router.post("/{graph_id}/attachments/file", status_code=201)
def upload_graph_attachment_file(
    graph_id: int,
    node_id: str = Form(...),
    title: str = Form(""),
    visible: bool = Form(True),
    file: UploadFile = File(...),
    teacher: User = Depends(teacher_user),
    db: Session = Depends(get_db),
):
    graph = graph_owner(db, teacher, graph_id)
    item = create_file_attachment_record(db, graph, node_id, file, title, visible)
    return {"data": serialize_attachment(item)}


@router.post("/{graph_id}/nodes/{node_id}/attachments/file", status_code=201)
def upload_node_attachment_file(
    graph_id: int,
    node_id: str,
    title: str = Form(""),
    visible: bool = Form(True),
    file: UploadFile = File(...),
    teacher: User = Depends(teacher_user),
    db: Session = Depends(get_db),
):
    graph = graph_owner(db, teacher, graph_id)
    item = create_file_attachment_record(db, graph, node_id, file, title, visible)
    return {"data": serialize_attachment(item)}


def resolve_file_attachment_for_download(
    db: Session,
    graph_id: int,
    attachment_id: str,
    user: User | None,
    node_id: str | None = None,
) -> tuple[TeacherGraphNodeAttachment, Path]:
    graph = graph_for_viewer(db, user, graph_id)
    if node_id is not None:
        ensure_graph_node(graph, node_id)
    item = db.get(TeacherGraphNodeAttachment, attachment_id)
    if not item or item.graph_id != graph.id or (node_id is not None and item.node_id != node_id):
        raise HTTPException(status_code=404, detail="挂载文件不存在")
    if item.resource_type != "file" or not item.stored_name:
        raise HTTPException(status_code=404, detail="挂载文件不存在")
    if (user is None or user.role == "student") and not item.visible:
        raise HTTPException(status_code=404, detail="挂载文件不存在")
    target = attachment_file_path(item.stored_name)
    if not target.exists():
        raise HTTPException(status_code=404, detail="挂载文件不存在")
    return item, target


@router.get("/{graph_id}/attachments/{attachment_id}/file")
def download_graph_attachment_file(
    graph_id: int,
    attachment_id: str,
    user: User | None = Depends(graph_viewer),
    db: Session = Depends(get_db),
):
    item, target = resolve_file_attachment_for_download(db, graph_id, attachment_id, user)
    return FileResponse(target, filename=item.file_name or item.title, media_type=item.file_mime_type or "application/octet-stream")


@router.get("/{graph_id}/nodes/{node_id}/attachments/{attachment_id}/file")
def download_node_attachment_file(
    graph_id: int,
    node_id: str,
    attachment_id: str,
    user: User | None = Depends(graph_viewer),
    db: Session = Depends(get_db),
):
    item, target = resolve_file_attachment_for_download(db, graph_id, attachment_id, user, node_id)
    return FileResponse(target, filename=item.file_name or item.title, media_type=item.file_mime_type or "application/octet-stream")


@router.put("/{graph_id}/nodes/{node_id}/attachments/{attachment_id}")
def update_node_attachment(
    graph_id: int,
    node_id: str,
    attachment_id: str,
    payload: GraphNodeAttachmentUpdate,
    teacher: User = Depends(teacher_user),
    db: Session = Depends(get_db),
):
    graph = graph_owner(db, teacher, graph_id)
    ensure_graph_node(graph, node_id)
    item = attachment_owner(db, graph, node_id, attachment_id)
    if item.resource_type == "file":
        raise HTTPException(status_code=409, detail="文件挂载请删除后重新上传")
    validate_attachment_payload(payload)
    item.title = payload.title.strip()
    item.resource_type = payload.resource_type
    item.content = payload.content.strip()
    item.link_url = payload.link_url.strip()
    item.visible = payload.visible
    item.updated_at = now()
    graph.updated_at = now()
    db.commit()
    return {"data": serialize_attachment(item)}


@router.delete("/{graph_id}/attachments/{attachment_id}")
def delete_graph_attachment(
    graph_id: int,
    attachment_id: str,
    teacher: User = Depends(teacher_user),
    db: Session = Depends(get_db),
):
    graph = graph_owner(db, teacher, graph_id)
    item = db.get(TeacherGraphNodeAttachment, attachment_id)
    if not item or item.graph_id != graph.id:
        raise HTTPException(status_code=404, detail="挂载知识不存在")
    remove_attachment_file(item)
    db.delete(item)
    graph.updated_at = now()
    db.commit()
    return {"data": {"id": attachment_id, "deleted": True}}


@router.delete("/{graph_id}/nodes/{node_id}/attachments/{attachment_id}")
def delete_node_attachment(
    graph_id: int,
    node_id: str,
    attachment_id: str,
    teacher: User = Depends(teacher_user),
    db: Session = Depends(get_db),
):
    graph = graph_owner(db, teacher, graph_id)
    item = attachment_owner(db, graph, node_id, attachment_id)
    remove_attachment_file(item)
    db.delete(item)
    graph.updated_at = now()
    db.commit()
    return {"data": {"id": attachment_id, "deleted": True}}


@router.post("/{graph_id}/publish")
def publish_graph(
    graph_id: int,
    payload: GraphPublish,
    teacher: User = Depends(teacher_user),
    db: Session = Depends(get_db),
):
    item = graph_owner(db, teacher, graph_id)
    if not parse_json(item.nodes_json, []):
        raise HTTPException(status_code=409, detail="空图谱不能发布")
    classes = resolve_publish_classes(db, teacher, payload.class_ids)
    published_at = now()
    existing = {
        publication.class_id: publication
        for publication in db.scalars(select(TeacherGraphPublication).where(TeacherGraphPublication.graph_id == item.id)).all()
    }
    selected_ids = {group.id for group in classes}
    for publication in existing.values():
        if publication.class_id not in selected_ids:
            db.delete(publication)
    for group in classes:
        publication = existing.get(group.id)
        if publication is None:
            publication = TeacherGraphPublication(
                id=f"pub-{uuid.uuid4().hex[:10]}",
                graph_id=item.id,
                class_id=group.id,
                course_id=group.course_id,
            )
            db.add(publication)
        publication.course_id = group.course_id
        publication.class_name = group.name
        publication.status = "published"
        publication.published_at = published_at
    item.target_classes = json.dumps([group.name for group in classes], ensure_ascii=False)
    item.status = "published"
    item.published_at = published_at
    item.updated_at = published_at
    synced = sync_graph_to_student_endpoint(item, teacher, classes, db, published_at)
    db.commit()
    result = serialize_graph(item, db=db)
    result["synced_student_graphs"] = synced
    return {"data": result}


@router.delete("/{graph_id}")
def delete_graph(graph_id: int, teacher: User = Depends(teacher_user), db: Session = Depends(get_db)):
    item = graph_owner(db, teacher, graph_id)
    attachments = db.scalars(select(TeacherGraphNodeAttachment).where(TeacherGraphNodeAttachment.graph_id == item.id)).all()
    for attachment in attachments:
        remove_attachment_file(attachment)
    db.delete(item); db.commit()
    return {"data": {"id": graph_id, "deleted": True}}


