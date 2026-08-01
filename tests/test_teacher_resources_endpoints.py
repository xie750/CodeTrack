"""教师端资料中心接口。对应开发方案 §七 资料中心、§7.4 开发边界、§15.1 权限、§15.2 数据。

这里钉住的核心不变量有三条：

1. 编辑资料不覆盖历史 —— 改动前的内容进 `knowledge_source_revisions`，旧行不动（§15.2）。
2. 被历史 AI 诊断引用过的资料不能删，只能停用；停用也抹不掉历史引用（§7.4）。
3. 教师只能看到自己有生效教学安排的课程资料，学生一律进不来（§15.1）。
"""

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from backend.app.core.database import SessionLocal
from backend.app.main import app
from backend.app.models import (
    AuditLog,
    Diagnosis,
    KnowledgeSource,
    KnowledgeSourceRevision,
    Submission,
    SubmissionVersion,
)

TEACHER = {"X-Demo-User-Id": "user_teacher_001"}
OTHER_TEACHER = {"X-Demo-User-Id": "user_teacher_002"}
STUDENT = {"X-Demo-User-Id": "user_student_001"}

COURSE_ID = "course_ds_001"
# 种子资料，被规则兜底诊断引用（seed.py 里的 sources）
SEEDED_ID = "kb_head_node_delete"

# 引用夹具用的 ID。用 boundary_review 这个任务而不是 task_linked_list_delete_001：
# 后者被 test_demo_flow 真实提交过，同一个 codetrack_test.db 上会撞
# (student_id, task_id) 唯一约束。
FIXTURE_TASK_ID = "task_linked_list_boundary_review_001"
FIXTURE_SUBMISSION_ID = "sub_resource_ref_fixture"
FIXTURE_VERSION_ID = "ver_resource_ref_fixture"
FIXTURE_DIAGNOSIS_ID = "diag_resource_ref_fixture"


@pytest.fixture()
def client():
    """带 lifespan 的客户端，保证建表和种子数据就绪。

    每个用例结束后把自己造的资料删干净：`_seeded_ids` 之外的行全部清掉，
    否则统计类断言会被上一个用例的残留带偏。
    """
    with TestClient(app) as test_client:
        db = SessionLocal()
        try:
            seeded = {source.id for source in db.query(KnowledgeSource).all()}
        finally:
            db.close()
        yield test_client
        _cleanup(seeded)


def _cleanup(keep_ids: set[str]) -> None:
    db = SessionLocal()
    try:
        for source in db.query(KnowledgeSource).all():
            if source.id in keep_ids:
                continue
            db.query(KnowledgeSourceRevision).filter(
                KnowledgeSourceRevision.source_id == source.id
            ).delete()
            # 这里绕过了 DELETE 接口，所以落盘的上传件要自己删，
            # 否则每跑一次测试就往 var/resources 里堆一批孤儿文件
            if source.storage_path:
                Path(source.storage_path).unlink(missing_ok=True)
            db.delete(source)
        db.commit()
    finally:
        db.close()


@pytest.fixture()
def referencing_diagnosis(client):
    """一条引用了 `SEEDED_ID` 的历史诊断。

    种子数据本身不含任何提交（学生要真跑一次沙箱才有），所以引用相关的用例得自己
    建最小链路：Submission -> SubmissionVersion -> Diagnosis。只到 Diagnosis 就够了，
    引用明细接口不读执行结果。
    """
    db = SessionLocal()
    try:
        _drop_fixture_rows(db)
        db.add(
            Submission(
                id=FIXTURE_SUBMISSION_ID,
                student_id="user_student_001",
                task_id=FIXTURE_TASK_ID,
                status="REVIEW_REQUIRED",
                latest_version_no=1,
            )
        )
        db.add(
            SubmissionVersion(
                id=FIXTURE_VERSION_ID,
                submission_id=FIXTURE_SUBMISSION_ID,
                version_no=1,
                language="cpp",
                source_code="Node* deleteNode(Node* head, int position) { return head; }",
                code_hash="resourcefixture",
            )
        )
        db.add(
            Diagnosis(
                id=FIXTURE_DIAGNOSIS_ID,
                submission_version_id=FIXTURE_VERSION_ID,
                status="READY",
                diagnosis_type="LINKED_LIST_HEAD_UPDATE_ERROR",
                confidence=0.42,
                explanation="删除头节点时没有更新链表起点。",
                knowledge_source_ids=json.dumps([SEEDED_ID], ensure_ascii=False),
                needs_teacher_review=True,
                model_provider="RULE_FALLBACK",
                model_name="rule-fallback",
                prompt_version="v0",
            )
        )
        db.commit()
    finally:
        db.close()

    yield FIXTURE_DIAGNOSIS_ID

    db = SessionLocal()
    try:
        _drop_fixture_rows(db)
        db.commit()
    finally:
        db.close()


def _drop_fixture_rows(db) -> None:
    for model, row_id in [
        (Diagnosis, FIXTURE_DIAGNOSIS_ID),
        (SubmissionVersion, FIXTURE_VERSION_ID),
        (Submission, FIXTURE_SUBMISSION_ID),
    ]:
        row = db.get(model, row_id)
        if row is not None:
            db.delete(row)
    db.flush()


def _create(client: TestClient, **overrides):
    payload = {
        "course_id": COURSE_ID,
        "title": "测试资料",
        "summary": "摘要",
        "content": "正文",
        "chapter": "第三章 线性表",
        "knowledge_points": ["链表边界处理"],
        "version": "v1.0",
    }
    payload.update(overrides)
    response = client.post("/api/v1/teacher/resources", headers=TEACHER, json=payload)
    assert response.status_code == 200, response.text
    return response.json()["data"]


# --- 权限（§15.1）-----------------------------------------------------------


def test_teacher_lists_own_course_resources(client):
    response = client.get(f"/api/v1/teacher/resources?course_id={COURSE_ID}", headers=TEACHER)
    assert response.status_code == 200
    body = response.json()
    data = body["data"]

    assert data["course_id"] == COURSE_ID
    assert SEEDED_ID in [item["resource_id"] for item in data["items"]]
    # 分页信息在 meta 里，列表接口必须分页（§15.5）
    assert body["meta"]["page"] == 1
    assert body["meta"]["total"] == data["stats"]["total"]
    # 章节和知识点选项由后端从真实数据聚合，前端不写死（§15.2）
    assert "第三章 线性表" in data["filters"]["chapters"]
    assert "链表边界处理" in data["filters"]["knowledge_points"]


def test_other_teacher_cannot_reach_course(client):
    """没有该课程生效教学安排的教师 403，不是返回空列表。"""
    response = client.get(f"/api/v1/teacher/resources?course_id={COURSE_ID}", headers=OTHER_TEACHER)
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "AUTH_FORBIDDEN"


def test_other_teacher_gets_404_on_detail(client):
    """详情用 404 而不是 403：否则能靠状态码探测别的课程有哪些资料 ID。"""
    response = client.get(f"/api/v1/teacher/resources/{SEEDED_ID}", headers=OTHER_TEACHER)
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "RESOURCE_NOT_FOUND"


def test_student_cannot_reach_teacher_resources(client):
    assert (
        client.get(f"/api/v1/teacher/resources?course_id={COURSE_ID}", headers=STUDENT).status_code
        == 403
    )
    assert (
        client.post(
            "/api/v1/teacher/resources",
            headers=STUDENT,
            json={"course_id": COURSE_ID, "title": "x"},
        ).status_code
        == 403
    )


# --- 新建与编辑（§7.2 A / B）------------------------------------------------


def test_create_then_appears_in_list(client):
    created = _create(client, title="链表复习讲义")
    assert created["status"] == "ACTIVE"
    # 知识点去重但保序
    assert created["knowledge_points"] == ["链表边界处理"]

    response = client.get(f"/api/v1/teacher/resources?course_id={COURSE_ID}", headers=TEACHER)
    items = {item["resource_id"]: item for item in response.json()["data"]["items"]}
    assert items[created["resource_id"]]["title"] == "链表复习讲义"


def test_knowledge_points_dedupe_preserves_order(client):
    created = _create(client, knowledge_points=["kp2", "kp1", "kp2", "  ", "kp1"])
    assert created["knowledge_points"] == ["kp2", "kp1"]


def test_edit_appends_revision_without_overwriting_history(client):
    """§15.2：改动前的内容留档，旧版本行不被改写。"""
    created = _create(client, title="旧标题", content="旧正文", version="v1.0")
    resource_id = created["resource_id"]

    response = client.patch(
        f"/api/v1/teacher/resources/{resource_id}",
        headers=TEACHER,
        json={"title": "新标题", "content": "新正文", "version": "v1.1", "change_note": "补充边界说明"},
    )
    assert response.status_code == 200
    data = response.json()["data"]

    assert data["title"] == "新标题"
    assert data["version"] == "v1.1"
    assert len(data["revisions"]) == 1

    revision = data["revisions"][0]
    assert revision["title"] == "旧标题"
    assert revision["content"] == "旧正文"
    assert revision["version"] == "v1.0"
    assert revision["change_note"] == "补充边界说明"

    # 再改一次，第一条历史必须原样还在
    client.patch(
        f"/api/v1/teacher/resources/{resource_id}",
        headers=TEACHER,
        json={"title": "第三版", "version": "v1.2"},
    )
    detail = client.get(f"/api/v1/teacher/resources/{resource_id}", headers=TEACHER).json()["data"]
    versions = [item["version"] for item in detail["revisions"]]
    assert sorted(versions) == ["v1.0", "v1.1"]
    oldest = [item for item in detail["revisions"] if item["version"] == "v1.0"][0]
    assert oldest["title"] == "旧标题"
    assert oldest["content"] == "旧正文"


def test_patch_returns_same_detail_shape_as_get(client):
    """PATCH 与 GET 详情必须同形状。

    少给一个 `copy_targets`，前端读 `.length` 会直接把整块共享/版本记录面板崩成空白 ——
    这条断言就是为那个回归钉的。
    """
    created = _create(client)
    resource_id = created["resource_id"]

    detail = client.get(f"/api/v1/teacher/resources/{resource_id}", headers=TEACHER).json()["data"]
    patched = client.patch(
        f"/api/v1/teacher/resources/{resource_id}", headers=TEACHER, json={"title": "改过的标题"}
    ).json()["data"]

    assert set(patched) == set(detail)
    assert isinstance(patched["copy_targets"], list)
    assert isinstance(patched["revisions"], list)


def test_switching_flags_does_not_create_revision(client):
    """开关和分类变化不算内容改动，不制造版本噪音。"""
    created = _create(client)
    response = client.patch(
        f"/api/v1/teacher/resources/{created['resource_id']}",
        headers=TEACHER,
        json={"student_visible": False, "chapter": "第四章 栈与队列"},
    )
    data = response.json()["data"]
    assert data["student_visible"] is False
    assert data["chapter"] == "第四章 栈与队列"
    assert data["revisions"] == []


def test_invalid_enum_is_rejected(client):
    created = _create(client)
    response = client.patch(
        f"/api/v1/teacher/resources/{created['resource_id']}",
        headers=TEACHER,
        json={"status": "WHATEVER"},
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "RESOURCE_FIELD_INVALID"


# --- 停用（§7.4）------------------------------------------------------------


def test_disable_removes_from_ai_retrieval_and_active_filter(client):
    """停用资料退出 AI 检索候选，并从「启用中」筛选里消失。"""
    created = _create(client, ai_retrievable=True)
    resource_id = created["resource_id"]
    assert created["ai_retrievable"] is True

    disabled = client.patch(
        f"/api/v1/teacher/resources/{resource_id}",
        headers=TEACHER,
        json={"status": "DISABLED"},
    ).json()["data"]
    assert disabled["status"] == "DISABLED"
    # 停用即退出检索，不需要教师再手动关一次开关
    assert disabled["ai_retrievable"] is False

    active = client.get(
        f"/api/v1/teacher/resources?course_id={COURSE_ID}&status=ACTIVE", headers=TEACHER
    ).json()["data"]
    assert resource_id not in [item["resource_id"] for item in active["items"]]

    only_disabled = client.get(
        f"/api/v1/teacher/resources?course_id={COURSE_ID}&status=DISABLED", headers=TEACHER
    ).json()["data"]
    assert resource_id in [item["resource_id"] for item in only_disabled["items"]]


def test_stats_cover_whole_course_not_current_page(client):
    """§7.2 A 统计卡覆盖整个课程，切状态筛选时计数不掉成 0。"""
    _create(client)
    unfiltered = client.get(
        f"/api/v1/teacher/resources?course_id={COURSE_ID}", headers=TEACHER
    ).json()["data"]["stats"]
    filtered = client.get(
        f"/api/v1/teacher/resources?course_id={COURSE_ID}&status=DISABLED", headers=TEACHER
    ).json()["data"]["stats"]
    assert filtered == unfiltered


# --- 删除与引用（§7.4）------------------------------------------------------


def test_delete_referenced_resource_is_rejected_and_history_survives(client, referencing_diagnosis):
    """被历史诊断引用过的资料不能删，历史引用照旧可读。"""
    db = SessionLocal()
    try:
        referencing = [
            diagnosis
            for diagnosis in db.query(Diagnosis).all()
            if SEEDED_ID in json.loads(diagnosis.knowledge_source_ids or "[]")
        ]
    finally:
        db.close()
    assert referencing_diagnosis in [item.id for item in referencing]

    response = client.delete(f"/api/v1/teacher/resources/{SEEDED_ID}", headers=TEACHER)
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "RESOURCE_IN_USE"

    # 资料还在，引用明细也还在（§7.4 历史引用不能被抹除）
    references = client.get(
        f"/api/v1/teacher/resources/{SEEDED_ID}/references", headers=TEACHER
    ).json()["data"]
    assert references["reference_count"] == len(referencing)
    assert referencing_diagnosis in [item["diagnosis_id"] for item in references["items"]]
    # 引用明细能下钻到学生和任务
    referenced = [
        item for item in references["items"] if item["diagnosis_id"] == referencing_diagnosis
    ][0]
    assert referenced["student_id"] == "user_student_001"
    assert referenced["task_id"] == FIXTURE_TASK_ID


def test_disable_keeps_historical_references(client, referencing_diagnosis):
    """§7.4：停用只影响新的检索，不抹除历史引用。"""
    client.patch(
        f"/api/v1/teacher/resources/{SEEDED_ID}", headers=TEACHER, json={"status": "DISABLED"}
    )
    references = client.get(
        f"/api/v1/teacher/resources/{SEEDED_ID}/references", headers=TEACHER
    ).json()["data"]
    assert referencing_diagnosis in [item["diagnosis_id"] for item in references["items"]]

    # 还原，免得影响后面的用例
    client.patch(
        f"/api/v1/teacher/resources/{SEEDED_ID}",
        headers=TEACHER,
        json={"status": "ACTIVE", "ai_retrievable": True},
    )


def test_delete_unreferenced_resource_succeeds(client):
    created = _create(client)
    resource_id = created["resource_id"]
    assert created["reference_count"] == 0

    assert client.delete(f"/api/v1/teacher/resources/{resource_id}", headers=TEACHER).status_code == 200
    assert client.get(f"/api/v1/teacher/resources/{resource_id}", headers=TEACHER).status_code == 404


def test_reference_count_is_real_not_stored(client, referencing_diagnosis):
    """引用次数直接数 diagnoses.knowledge_source_ids，不靠单独的计数列。"""
    detail = client.get(f"/api/v1/teacher/resources/{SEEDED_ID}", headers=TEACHER).json()["data"]
    references = client.get(
        f"/api/v1/teacher/resources/{SEEDED_ID}/references", headers=TEACHER
    ).json()["data"]
    assert detail["reference_count"] == references["reference_count"] > 0


# --- 上传（§7.4 第一版只落盘 + 元数据）--------------------------------------


def test_upload_stores_file_metadata_and_stays_out_of_retrieval(client):
    response = client.post(
        "/api/v1/teacher/resources/upload",
        headers=TEACHER,
        data={"course_id": COURSE_ID, "title": "第三章课件", "source_type": "COURSEWARE"},
        files={"file": ("chapter3.pdf", b"%PDF-1.4 fake", "application/pdf")},
    )
    assert response.status_code == 200, response.text
    data = response.json()["data"]

    assert data["file_name"] == "chapter3.pdf"
    assert data["file_size"] == len(b"%PDF-1.4 fake")
    assert data["mime_type"] == "application/pdf"
    assert data["has_file"] is True
    # 第一版不做切片，正文为空，所以既不算启用也不参与检索
    assert data["status"] == "PARSE_PENDING"
    assert data["ai_retrievable"] is False
    assert data["content"] == ""

    stats = client.get(
        f"/api/v1/teacher/resources?course_id={COURSE_ID}", headers=TEACHER
    ).json()["data"]["stats"]
    assert stats["parse_pending"] >= 1


def test_upload_cannot_be_switched_into_retrieval_while_content_empty(client):
    """正文还是空的上传件，就算教师手动打开 AI 检索也要被兜住。"""
    uploaded = client.post(
        "/api/v1/teacher/resources/upload",
        headers=TEACHER,
        data={"course_id": COURSE_ID, "title": "空正文课件"},
        files={"file": ("x.pptx", b"binary-blob", None)},
    ).json()["data"]

    patched = client.patch(
        f"/api/v1/teacher/resources/{uploaded['resource_id']}",
        headers=TEACHER,
        json={"status": "ACTIVE", "ai_retrievable": True},
    ).json()["data"]
    assert patched["status"] == "ACTIVE"
    assert patched["ai_retrievable"] is False

    # 补上正文之后才允许进检索
    parsed = client.patch(
        f"/api/v1/teacher/resources/{uploaded['resource_id']}",
        headers=TEACHER,
        json={"content": "解析后的课件正文", "ai_retrievable": True},
    ).json()["data"]
    assert parsed["ai_retrievable"] is True


def test_upload_rejects_empty_file(client):
    response = client.post(
        "/api/v1/teacher/resources/upload",
        headers=TEACHER,
        data={"course_id": COURSE_ID, "title": "空文件"},
        files={"file": ("empty.txt", b"", "text/plain")},
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "RESOURCE_FILE_EMPTY"


def test_upload_sanitizes_path_traversal_in_file_name(client):
    uploaded = client.post(
        "/api/v1/teacher/resources/upload",
        headers=TEACHER,
        data={"course_id": COURSE_ID, "title": "恶意文件名"},
        files={"file": ("../../etc/passwd", b"data", "text/plain")},
    ).json()["data"]
    assert "/" not in uploaded["file_name"]
    assert ".." not in uploaded["file_name"]


# --- 复制到课程（§7.2 C）----------------------------------------------------


def test_copy_to_course_requires_target_scope(client):
    """目标课程也要过教学安排校验，不能借复制把资料塞进没授课的课程。"""
    created = _create(client)
    response = client.post(
        f"/api/v1/teacher/resources/{created['resource_id']}/copy",
        headers=TEACHER,
        json={"target_course_id": "course_network_001"},
    )
    assert response.status_code == 403


def test_copy_to_same_course_is_rejected(client):
    created = _create(client)
    response = client.post(
        f"/api/v1/teacher/resources/{created['resource_id']}/copy",
        headers=TEACHER,
        json={"target_course_id": COURSE_ID},
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "RESOURCE_COPY_SAME_COURSE"


# --- 审计（§15.2）-----------------------------------------------------------


def test_writes_are_audited_with_resource_id_kept(client):
    """`safe_details` 是允许列表，resource_id 必须在里面，否则写了等于没写。"""
    created = _create(client)
    resource_id = created["resource_id"]
    client.patch(
        f"/api/v1/teacher/resources/{resource_id}", headers=TEACHER, json={"title": "改过的标题"}
    )

    db = SessionLocal()
    try:
        entries = (
            db.query(AuditLog)
            .filter(AuditLog.event_type.in_(["TEACHER_RESOURCE_CREATED", "TEACHER_RESOURCE_UPDATED"]))
            .all()
        )
        matched = [
            entry for entry in entries if json.loads(entry.details).get("resource_id") == resource_id
        ]
    finally:
        db.close()

    event_types = {entry.event_type for entry in matched}
    assert event_types == {"TEACHER_RESOURCE_CREATED", "TEACHER_RESOURCE_UPDATED"}
    for entry in matched:
        details = json.loads(entry.details)
        assert details["resource_action"] in {"CREATE", "UPDATE"}
        assert entry.user_id == "user_teacher_001"
