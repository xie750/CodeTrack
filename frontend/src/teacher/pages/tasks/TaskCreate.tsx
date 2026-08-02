import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Save, Send, Trash2 } from "lucide-react";
import TeacherSubNav from "../../components/TeacherSubNav";
import { createTeacherTask, getTeacherTasks, publishTeacherTask } from "../../teacherApi";
import type { TeacherQuestionPayload, TeacherTaskListData } from "../../teacherTypes";
import { taskCenterNav } from "./taskCenterNav";

type DraftOption = {
  label: string;
  content: string;
  isCorrect: boolean;
};

type DraftQuestion = {
  stem: string;
  analysis: string;
  knowledgePoints: string;
  difficulty: string;
  score: number;
  options: DraftOption[];
};

const DEFAULT_OPTIONS: DraftOption[] = [
  { label: "A", content: "选项 A", isCorrect: true },
  { label: "B", content: "选项 B", isCorrect: false },
  { label: "C", content: "选项 C", isCorrect: false },
  { label: "D", content: "选项 D", isCorrect: false },
];

function newQuestion(): DraftQuestion {
  return {
    stem: "这里填写题干",
    analysis: "这里填写解析，学生提交后可查看。",
    knowledgePoints: "链表, 边界处理",
    difficulty: "BASIC",
    score: 10,
    options: DEFAULT_OPTIONS.map((item) => ({ ...item })),
  };
}

function splitCsv(value: string) {
  return value
    .split(/[，,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function toQuestionPayload(question: DraftQuestion): TeacherQuestionPayload {
  return {
    question_type: "SINGLE_CHOICE",
    stem: question.stem,
    analysis: question.analysis,
    knowledge_points: splitCsv(question.knowledgePoints),
    difficulty: question.difficulty,
    score: question.score,
    options: question.options.map((option) => ({
      label: option.label,
      content: option.content,
      is_correct: option.isCorrect,
    })),
  };
}

export default function TaskCreate() {
  const navigate = useNavigate();
  const [meta, setMeta] = useState<TeacherTaskListData | null>(null);
  const [courseId, setCourseId] = useState("");
  const [classId, setClassId] = useState("");
  const [title, setTitle] = useState("新建链路测试练习");
  const [description, setDescription] = useState("用于验证教师创建发布后，学生端可以收到并进入做题页面。");
  const [objectives, setObjectives] = useState("链表, 边界处理");
  const [assignmentMode, setAssignmentMode] = useState("QUIZ");
  const [deadline, setDeadline] = useState("");
  const [questions, setQuestions] = useState<DraftQuestion[]>([newQuestion()]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    getTeacherTasks({ page: 1, pageSize: 1 })
      .then((data) => {
        if (!alive) return;
        setMeta(data);
        const firstCourse = data.course_options[0]?.course_id ?? "";
        const firstClass = data.class_options[0]?.class_id ?? "";
        setCourseId((current) => current || firstCourse);
        setClassId((current) => current || firstClass);
      })
      .catch(() => setError("加载课程和班级失败，请确认当前账号是教师账号。"))
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const classOptions = useMemo(() => meta?.class_options ?? [], [meta]);
  const canSubmit = Boolean(courseId && title.trim() && description.trim() && questions.length);

  function updateQuestion(index: number, patch: Partial<DraftQuestion>) {
    setQuestions((current) =>
      current.map((question, itemIndex) => (itemIndex === index ? { ...question, ...patch } : question))
    );
  }

  function updateOption(questionIndex: number, optionIndex: number, patch: Partial<DraftOption>) {
    setQuestions((current) =>
      current.map((question, itemIndex) => {
        if (itemIndex !== questionIndex) return question;
        const options = question.options.map((option, currentOptionIndex) => {
          if (currentOptionIndex !== optionIndex) return patch.isCorrect ? { ...option, isCorrect: false } : option;
          return { ...option, ...patch };
        });
        return { ...question, options };
      })
    );
  }

  async function submit(publish: boolean) {
    if (!canSubmit) return;
    if (publish && !classId) {
      setError("请选择要发布到的班级。");
      return;
    }
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const created = await createTeacherTask({
        course_id: courseId,
        title,
        description,
        workspace_type: "QUESTION_SET",
        language: "CPP",
        interface_spec: "ListNode* deleteAt(ListNode* head, int position);",
        learning_objectives: splitCsv(objectives),
        capability_ids: [],
        questions: questions.map(toQuestionPayload),
      });
      if (publish) {
        const result = await publishTeacherTask(created.task_id, {
          class_ids: [classId],
          assignment_mode: assignmentMode,
          allow_hint_level_3: true,
          deadline: deadline ? new Date(deadline).toISOString() : null,
        });
        setMessage(`已创建并发布：${created.title}，初始化 ${result.publications[0]?.initialized_student_count ?? 0} 名学生。`);
      } else {
        setMessage(`已创建任务：${created.title}。`);
      }
      window.setTimeout(() => navigate("/teacher/tasks"), 800);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="review-page task-page">
      <header className="review-head">
        <div className="review-head-copy">
          <h1>新建题目</h1>
          <p>创建客观题任务并发布到班级。发布成功后，学生端班级任务会立即读到这条任务。</p>
        </div>
        <div className="review-head-actions">
          <button className="review-back" type="button" onClick={() => navigate("/teacher/tasks")}>
            返回列表
          </button>
        </div>
      </header>

      <TeacherSubNav items={taskCenterNav} ariaLabel="任务中心二级导航" />

      {error ? <p className="review-message error">{error}</p> : null}
      {message ? <p className="review-message success">{message}</p> : null}

      <section className="class-card task-create-form">
        <div className="review-filter-group">
          <label className="task-form-field">
            <span>课程</span>
            <select className="review-select" value={courseId} disabled={loading} onChange={(event) => setCourseId(event.target.value)}>
              {(meta?.course_options ?? []).map((option) => (
                <option value={option.course_id} key={option.course_id}>
                  {option.name}
                </option>
              ))}
            </select>
          </label>
          <label className="task-form-field">
            <span>发布班级</span>
            <select className="review-select" value={classId} disabled={loading} onChange={(event) => setClassId(event.target.value)}>
              {classOptions.map((option) => (
                <option value={option.class_id} key={option.class_id}>
                  {option.name}
                </option>
              ))}
            </select>
          </label>
          <label className="task-form-field">
            <span>发布模式</span>
            <select className="review-select" value={assignmentMode} onChange={(event) => setAssignmentMode(event.target.value)}>
              <option value="QUIZ">练习</option>
              <option value="EXAM">考核</option>
              <option value="PRACTICE">普通任务</option>
            </select>
          </label>
          <label className="task-form-field">
            <span>截止时间</span>
            <input className="review-select" type="datetime-local" value={deadline} onChange={(event) => setDeadline(event.target.value)} />
          </label>
        </div>

        <label className="task-form-field wide">
          <span>题目标题</span>
          <input value={title} onChange={(event) => setTitle(event.target.value)} />
        </label>
        <label className="task-form-field wide">
          <span>任务说明</span>
          <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} />
        </label>
        <label className="task-form-field wide">
          <span>学习目标 / 知识点</span>
          <input value={objectives} onChange={(event) => setObjectives(event.target.value)} />
        </label>
      </section>

      <section className="review-list" aria-label="题目编辑">
        {questions.map((question, questionIndex) => (
          <article className="class-card task-row" key={questionIndex}>
            <div className="task-row-main">
              <h2>第 {questionIndex + 1} 题</h2>
              <label className="task-form-field wide">
                <span>题干</span>
                <textarea value={question.stem} onChange={(event) => updateQuestion(questionIndex, { stem: event.target.value })} rows={3} />
              </label>
              <label className="task-form-field wide">
                <span>解析</span>
                <textarea value={question.analysis} onChange={(event) => updateQuestion(questionIndex, { analysis: event.target.value })} rows={2} />
              </label>
              <div className="review-filter-group">
                <label className="task-form-field">
                  <span>知识点</span>
                  <input value={question.knowledgePoints} onChange={(event) => updateQuestion(questionIndex, { knowledgePoints: event.target.value })} />
                </label>
                <label className="task-form-field">
                  <span>分值</span>
                  <input type="number" min={1} value={question.score} onChange={(event) => updateQuestion(questionIndex, { score: Number(event.target.value) || 1 })} />
                </label>
              </div>
              <div className="task-option-list">
                {question.options.map((option, optionIndex) => (
                  <label className="task-option-row" key={option.label}>
                    <input
                      type="radio"
                      name={`correct-${questionIndex}`}
                      checked={option.isCorrect}
                      onChange={() => updateOption(questionIndex, optionIndex, { isCorrect: true })}
                    />
                    <strong>{option.label}</strong>
                    <input value={option.content} onChange={(event) => updateOption(questionIndex, optionIndex, { content: event.target.value })} />
                  </label>
                ))}
              </div>
            </div>
            <div className="task-actions">
              <button type="button" disabled={questions.length <= 1} onClick={() => setQuestions((current) => current.filter((_, index) => index !== questionIndex))}>
                <Trash2 size={14} /> 删除本题
              </button>
            </div>
          </article>
        ))}
      </section>

      <div className="review-head-actions task-create-actions">
        <button type="button" onClick={() => setQuestions((current) => [...current, newQuestion()])}>
          <Plus size={15} /> 添加题目
        </button>
        <button type="button" disabled={!canSubmit || saving} onClick={() => submit(false)}>
          <Save size={15} /> {saving ? "保存中" : "保存草稿"}
        </button>
        <button className="task-primary-btn" type="button" disabled={!canSubmit || saving || !classId} onClick={() => submit(true)}>
          <Send size={15} /> {saving ? "发布中" : "保存并发布"}
        </button>
      </div>
    </div>
  );
}
