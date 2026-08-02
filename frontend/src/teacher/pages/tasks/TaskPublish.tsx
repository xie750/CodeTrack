import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Send } from "lucide-react";
import TeacherSubNav from "../../components/TeacherSubNav";
import { getTeacherTasks, publishTeacherTask } from "../../teacherApi";
import type { TeacherTaskListData, TeacherTaskRow } from "../../teacherTypes";
import { taskCenterNav } from "./taskCenterNav";

export default function TaskPublish() {
  const { taskId } = useParams<{ taskId: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<TeacherTaskListData | null>(null);
  const [task, setTask] = useState<TeacherTaskRow | null>(null);
  const [classId, setClassId] = useState("");
  const [assignmentMode, setAssignmentMode] = useState("QUIZ");
  const [deadline, setDeadline] = useState("");
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!taskId) return;
    let alive = true;
    setLoading(true);
    getTeacherTasks({ page: 1, pageSize: 100 })
      .then((result) => {
        if (!alive) return;
        setData(result);
        const found = result.items.find((item) => item.task_id === taskId) ?? null;
        setTask(found);
        setClassId(result.class_options[0]?.class_id ?? "");
      })
      .catch(() => setError("发布信息加载失败。"))
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [taskId]);

  const classOptions = useMemo(() => data?.class_options ?? [], [data]);

  async function publish() {
    if (!taskId || !classId) return;
    setPublishing(true);
    setError("");
    setMessage("");
    try {
      const result = await publishTeacherTask(taskId, {
        class_ids: [classId],
        assignment_mode: assignmentMode,
        allow_hint_level_3: true,
        deadline: deadline ? new Date(deadline).toISOString() : null,
      });
      setMessage(`发布成功，初始化 ${result.publications[0]?.initialized_student_count ?? 0} 名学生。`);
      window.setTimeout(() => navigate("/teacher/tasks"), 800);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "发布失败");
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div className="review-page task-page">
      <header className="review-head">
        <div className="review-head-copy">
          <h1>任务发布</h1>
          <p>选择班级并正式下发任务。发布后学生端班级任务列表会读取到对应 assignment。</p>
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

      <section className="class-card task-create-form" aria-busy={loading}>
        <h2>{task?.title ?? "正在加载任务"}</h2>
        <p>{task?.description ?? "请稍候..."}</p>
        <div className="task-row-meta">
          <span>任务 ID：{taskId}</span>
          <span>类型：{task?.workspace_type ?? "-"}</span>
          <span>题目数：{task?.question_count ?? "-"}</span>
        </div>

        <div className="review-filter-group">
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

        <div className="review-head-actions task-create-actions">
          <button className="task-primary-btn" type="button" disabled={!task || !classId || publishing} onClick={publish}>
            <Send size={15} /> {publishing ? "发布中" : "确认发布"}
          </button>
        </div>
      </section>
    </div>
  );
}
