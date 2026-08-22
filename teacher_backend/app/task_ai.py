from datetime import datetime, timedelta
import uuid

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from .database import get_db
from .models import AuditLog, Course, Task, TestCase, User


router = APIRouter(prefix="/api/v1/teacher/tasks")


class AITaskDraftRequest(BaseModel):
    course_id: str
    class_id: str | None = None
    prompt: str = Field(min_length=4, max_length=1000)


def teacher_user(
    x_user_id: str = Header(default="teacher-01"),
    db: Session = Depends(get_db),
) -> User:
    user = db.get(User, x_user_id)
    if not user or user.role != "teacher":
        raise HTTPException(status_code=403, detail="Teacher permission required")
    return user


@router.post("/ai-draft", status_code=201)
def generate_ai_task_draft(
    payload: AITaskDraftRequest,
    teacher: User = Depends(teacher_user),
    db: Session = Depends(get_db),
):
    course = db.get(Course, payload.course_id)
    if not course or course.teacher_id != teacher.id:
        raise HTTPException(status_code=404, detail="Course not found")

    prompt = payload.prompt.lower()
    if any(keyword in prompt for keyword in ["选择", "测验", "quiz", "客观"]):
        task_type = "quiz"
        title = "AI 生成知识点测验"
        description = "根据教师对话生成的客观题练习草稿。"
    elif any(keyword in prompt for keyword in ["项目", "综合", "project"]):
        task_type = "project"
        title = "AI 生成综合项目任务"
        description = "根据教师对话生成的综合项目草稿。"
    else:
        task_type = "programming"
        title = "AI 生成编程练习"
        description = "根据教师对话生成的编程任务草稿，需教师检查后发布。"

    if "链表" in payload.prompt:
        title = "链表边界条件专项练习"
        chapter = "第 3 章 函数结构"
    elif "栈" in payload.prompt:
        title = "栈与括号匹配练习"
        chapter = "第 5 章 列表结构"
    elif "二叉树" in payload.prompt:
        title = "二叉树遍历练习"
        chapter = "第 7 章 排序算法"
    else:
        chapter = "AI 生成内容"

    task_id = f"task-ai-{uuid.uuid4().hex[:10]}"
    task = Task(
        id=task_id,
        course_id=payload.course_id,
        class_id=payload.class_id,
        title=title,
        type=task_type,
        chapter_label=chapter,
        description=description,
        starter_code="// AI draft. Review before publishing.\n",
        status="draft",
        difficulty="进阶",
        due_at=datetime.now().replace(microsecond=0) + timedelta(days=14),
        allow_hints=True,
    )
    db.add(task)
    db.flush()
    for index, name in enumerate(["基础用例", "边界用例", "隐藏用例"], 1):
        db.add(TestCase(
            id=f"case-ai-{uuid.uuid4().hex[:10]}",
            task_id=task.id,
            name=name,
            hidden=index == 3,
            weight=30 if index < 3 else 40,
        ))
    db.add(AuditLog(
        actor_id=teacher.id,
        action="task.ai_draft.generate",
        resource_type="task",
        resource_id=task.id,
        detail=payload.prompt,
    ))
    db.commit()
    return {
        "data": {
            "id": task.id,
            "title": task.title,
            "type": task.type,
            "chapter": task.chapter_label,
            "description": task.description,
            "status": task.status,
            "generator": "rule_fallback",
            "requires_teacher_confirmation": True,
        }
    }


