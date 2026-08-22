from __future__ import annotations

from collections import Counter
from datetime import datetime
from io import BytesIO
import json
import math
import os
import re
import uuid

import httpx
from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from .database import get_db
from .models import TeacherKnowledgeGraph, User


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
ALLOWED_SUFFIXES = {".pdf", ".docx", ".md", ".txt"}


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


def now() -> datetime:
    return datetime.now().replace(microsecond=0)


def teacher_user(x_user_id: str = Header(default="teacher-01"), db: Session = Depends(get_db)) -> User:
    user = db.get(User, x_user_id)
    if not user or user.role != "teacher":
        raise HTTPException(status_code=403, detail="需要教师权限")
    return user


def parse_json(value: str, fallback):
    try:
        parsed = json.loads(value or "")
        return parsed if isinstance(parsed, type(fallback)) else fallback
    except (TypeError, ValueError):
        return fallback


def graph_owner(db: Session, teacher: User, graph_id: int) -> TeacherKnowledgeGraph:
    item = db.get(TeacherKnowledgeGraph, graph_id)
    if not item or item.user_id != teacher.id:
        raise HTTPException(status_code=404, detail="图谱不存在")
    return item


def serialize_graph(item: TeacherKnowledgeGraph, detail: bool = True) -> dict:
    nodes = parse_json(item.nodes_json, [])
    edges = parse_json(item.edges_json, [])
    result = {
        "id": item.id,
        "title": item.title,
        "description": item.description,
        "status": item.status,
        "target_classes": parse_json(item.target_classes, []),
        "source_files": parse_json(item.source_files, []),
        "source_summary": item.source_summary,
        "node_count": len(nodes),
        "edge_count": len(edges),
        "created_at": item.created_at.isoformat(),
        "updated_at": item.updated_at.isoformat(),
        "published_at": item.published_at.isoformat() if item.published_at else "",
    }
    if detail:
        result.update(nodes=nodes, edges=edges)
    return result


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


def extract_text(filename: str, content: bytes) -> str:
    suffix = os.path.splitext(filename.lower())[1]
    if suffix not in ALLOWED_SUFFIXES:
        raise HTTPException(status_code=415, detail=f"不支持的文件格式：{filename}")
    try:
        if suffix in {".txt", ".md"}:
            return content.decode("utf-8-sig", errors="ignore")
        if suffix == ".docx":
            from docx import Document
            document = Document(BytesIO(content))
            return "\n".join(paragraph.text for paragraph in document.paragraphs)
        from pypdf import PdfReader
        return "\n".join(page.extract_text() or "" for page in PdfReader(BytesIO(content)).pages)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"无法解析文件：{filename}") from exc


@router.get("")
def list_graphs(teacher: User = Depends(teacher_user), db: Session = Depends(get_db)):
    items = db.scalars(select(TeacherKnowledgeGraph).where(TeacherKnowledgeGraph.user_id == teacher.id).order_by(TeacherKnowledgeGraph.updated_at.desc())).all()
    return {"data": [serialize_graph(item, detail=False) for item in items]}


@router.get("/{graph_id}")
def get_graph(graph_id: int, teacher: User = Depends(teacher_user), db: Session = Depends(get_db)):
    return {"data": serialize_graph(graph_owner(db, teacher, graph_id))}


@router.post("", status_code=201)
def create_graph(payload: GraphCreate, teacher: User = Depends(teacher_user), db: Session = Depends(get_db)):
    raw = payload.model_dump()
    nodes = raw["nodes"] or [{"label": "核心知识点", "type": "知识点", "description": "双击或在右侧面板中编辑节点内容。", "difficulty": 2, "x": 430, "y": 270, "color": "#2563eb", "source": "custom"}]
    _, nodes, edges = normalize_generated({"nodes": nodes, "edges": raw["edges"]})
    for node in nodes:
        node["source"] = "custom"
    item = TeacherKnowledgeGraph(user_id=teacher.id, title=payload.title.strip(), description=payload.description.strip(), target_classes=json.dumps(payload.target_classes, ensure_ascii=False), nodes_json=json.dumps(nodes, ensure_ascii=False), edges_json=json.dumps(edges, ensure_ascii=False))
    db.add(item); db.commit(); db.refresh(item)
    return {"data": serialize_graph(item)}


@router.post("/from-files", status_code=201)
async def create_graph_from_files(files: list[UploadFile] = File(...), title: str = Form(...), description: str = Form(""), target_classes: str = Form(""), teacher: User = Depends(teacher_user), db: Session = Depends(get_db)):
    if not files:
        raise HTTPException(status_code=422, detail="请至少上传一份资料")
    text_parts: list[str] = []
    sources: list[dict] = []
    for upload in files:
        content = await upload.read()
        if len(content) > 20 * 1024 * 1024:
            raise HTTPException(status_code=413, detail=f"文件超过 20 MB：{upload.filename}")
        filename = upload.filename or "资料.txt"
        text_parts.append(extract_text(filename, content))
        sources.append({"filename": filename, "mime_type": upload.content_type or "application/octet-stream", "size_bytes": len(content)})
    combined = "\n\n".join(text_parts)[:6000]
    if not combined.strip():
        raise HTTPException(status_code=422, detail="未能从上传资料中提取有效文本")
    generated = llm_graph(combined, title) or heuristic_graph(combined, title)
    summary, nodes, edges = normalize_generated(generated)
    classes = [value.strip() for value in re.split(r"[,，\n]+", target_classes) if value.strip()]
    item = TeacherKnowledgeGraph(user_id=teacher.id, title=title.strip() or "资料知识图谱", description=description.strip(), target_classes=json.dumps(classes, ensure_ascii=False), source_files=json.dumps(sources, ensure_ascii=False), source_summary=summary, nodes_json=json.dumps(nodes, ensure_ascii=False), edges_json=json.dumps(edges, ensure_ascii=False))
    db.add(item); db.commit(); db.refresh(item)
    return {"data": serialize_graph(item)}


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
    item.title = payload.title.strip(); item.description = payload.description.strip(); item.target_classes = json.dumps(payload.target_classes, ensure_ascii=False); item.status = payload.status if payload.status in {"draft", "published"} else "draft"; item.nodes_json = json.dumps(nodes, ensure_ascii=False); item.edges_json = json.dumps(edges, ensure_ascii=False); item.updated_at = now()
    if item.status == "published" and not item.published_at:
        item.published_at = now()
    db.commit()
    return {"data": serialize_graph(item)}


@router.post("/{graph_id}/publish")
def publish_graph(graph_id: int, teacher: User = Depends(teacher_user), db: Session = Depends(get_db)):
    item = graph_owner(db, teacher, graph_id)
    if not parse_json(item.nodes_json, []):
        raise HTTPException(status_code=409, detail="空图谱不能发布")
    item.status = "published"; item.published_at = now(); item.updated_at = now(); db.commit()
    return {"data": serialize_graph(item)}


@router.delete("/{graph_id}")
def delete_graph(graph_id: int, teacher: User = Depends(teacher_user), db: Session = Depends(get_db)):
    item = graph_owner(db, teacher, graph_id)
    db.delete(item); db.commit()
    return {"data": {"id": graph_id, "deleted": True}}


