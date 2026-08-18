from datetime import datetime

from typing import Any

from pydantic import BaseModel, Field, model_validator


class TeacherLogin(BaseModel):
    username: str = Field(min_length=1, max_length=80)
    password: str = Field(min_length=1, max_length=128)


class CourseDraftUpsert(BaseModel):
    payload: dict[str, Any]


class TeacherPreferenceUpdate(BaseModel):
    notifications_enabled: bool = True
    ai_assistant_enabled: bool = True
    email_digest: bool = False


class CourseCreate(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    code: str = Field(min_length=2, max_length=40)
    term: str
    description: str = ""
    student_visible: bool = False
    chapter_titles: list[str] = []


class CourseUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=160)
    term: str | None = None
    description: str | None = None
    status: str | None = Field(default=None, pattern="^(active|preparing|archived)$")
    student_visible: bool | None = None


class ClassCreate(BaseModel):
    course_id: str
    name: str = Field(min_length=2, max_length=120)
    grade: str = Field(default="2024级", min_length=2, max_length=40)
    major: str = Field(default="软件工程", min_length=2, max_length=120)
    schedule: str = ""
    mentor: str = ""
    status: str = Field(default="active", pattern="^(active|closed|pending)$")


class ChapterCreate(BaseModel):
    title: str = Field(min_length=2, max_length=160)
    description: str = ""
    teaching_mode: str = "理论讲授"


class ChapterUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=2, max_length=160)
    description: str | None = None
    teaching_mode: str | None = None
    status: str | None = Field(default=None, pattern="^(draft|published)$")


class KnowledgePointCreate(BaseModel):
    chapter_id: str
    name: str = Field(min_length=1, max_length=120)
    description: str = ""
    difficulty: str = "基础"
    position_x: int = Field(default=50, ge=0, le=100)
    position_y: int = Field(default=50, ge=0, le=100)


class MaterialCreate(BaseModel):
    course_id: str
    title: str
    type: str
    chapter_label: str
    size: str = ""
    visibility: str = "teacher"
    content_url: str | None = None


class TestCaseCreate(BaseModel):
    name: str
    input_data: str = ""
    expected_output: str = ""
    hidden: bool = False
    weight: int = Field(default=10, ge=0, le=100)


class TaskCreate(BaseModel):
    course_id: str
    class_id: str | None = None
    title: str = Field(min_length=2, max_length=200)
    type: str = "programming"
    chapter_label: str
    description: str = ""
    starter_code: str = ""
    difficulty: str = "基础"
    total_score: int = Field(default=100, ge=1, le=1000)
    due_at: datetime
    allow_hints: bool = True
    test_cases: list[TestCaseCreate]

    @model_validator(mode="after")
    def validate_test_cases(self):
        if not self.test_cases:
            raise ValueError("至少需要一个测试用例")
        return self


class TaskPublish(BaseModel):
    class_id: str
    publish_at: datetime | None = None
    due_at: datetime

    @model_validator(mode="after")
    def validate_dates(self):
        start = self.publish_at or datetime.now()
        if self.due_at <= start:
            raise ValueError("截止时间必须晚于发布时间")
        return self


class StudentSubmissionCreate(BaseModel):
    source_code: str = Field(min_length=5)
    hint_level: int = Field(default=0, ge=0, le=3)


class GradeUpsert(BaseModel):
    score: int = Field(ge=0, le=100)
    comment: str = ""
    dimensions: dict[str, int] | None = None


class FeedbackCreate(BaseModel):
    content: str = Field(min_length=1)
    publish: bool = False


class ReviewAction(BaseModel):
    status: str
    reviewed_explanation: str | None = None
    comment: str = ""

    @model_validator(mode="after")
    def validate_status(self):
        if self.status not in {"accepted", "modified", "rejected"}:
            raise ValueError("无效审核状态")
        if self.status == "modified" and not self.reviewed_explanation:
            raise ValueError("修改后接受必须填写审核内容")
        return self


class NotificationRead(BaseModel):
    read: bool = True
