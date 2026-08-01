import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { RefreshCw } from "lucide-react";
import {
  getDiagnosisClassOptions,
  getDiagnosisStudentOptions,
  getDiagnosisTaskOptions,
  getTeacherTeachingAssignments,
} from "../teacherApi";
import type {
  DiagnosisClassOption,
  DiagnosisStudentOption,
  DiagnosisTaskOption,
  TeacherTeachingAssignment,
} from "../teacherTypes";
import ClassOverview from "./diagnosis/ClassOverview";
import StudentDiagnosis from "./diagnosis/StudentDiagnosis";
import AlertCenter from "./diagnosis/AlertCenter";

/**
 * 学情诊断（开发方案 §十）
 *
 * 页面外壳负责教学上下文：课程 → 班级 → 任务 / 学生，四个下拉全部来自后端接口，
 * 不写死任何编号（§15.2）。切换课程后下级选择清空并重新拉取。
 *
 * 课程列表刻意用 /teaching-assignments 而不是 /courses：后者把「教师只是课程成员但
 * 没有教学安排」的课程也算进来（union Enrollment 和 TeachingAssignment），选中这类
 * 课程会直接 403，因为学情范围是按教学安排算的（§15.1）。
 *
 * 三个 Tab 对应 §10.1 / §10.2 / §10.3。控件样式沿用学生端那套 token 与 AI 审核页
 * 一致：.class-card / .class-stat / .class-tabs / .review-select / .class-empty，
 * 不使用 antd 默认外观。
 */

type Tab = "class" | "student" | "alerts";

const TABS: Array<{ key: Tab; label: string }> = [
  { key: "class", label: "班级学情总览" },
  { key: "student", label: "个体诊断" },
  { key: "alerts", label: "预警中心" },
];

export default function DiagnosisSummary() {
  /**
   * 支持带范围的深链：课程与班级（§六 6.1）的「查看学情」会带上
   * ?course_id=&class_id=&student_id=，落地就该是对应范围，不用教师再手选一遍。
   * 只作为初值读一次，之后由页面内的选择器接管。
   */
  const [searchParams] = useSearchParams();
  const initialCourseId = searchParams.get("course_id") ?? "";
  const initialClassId = searchParams.get("class_id") ?? "";
  const initialStudentId = searchParams.get("student_id") ?? "";

  const [assignments, setAssignments] = useState<TeacherTeachingAssignment[]>([]);
  const [classes, setClasses] = useState<DiagnosisClassOption[]>([]);
  const [students, setStudents] = useState<DiagnosisStudentOption[]>([]);
  const [tasks, setTasks] = useState<DiagnosisTaskOption[]>([]);

  const [courseId, setCourseId] = useState(initialCourseId);
  const [classId, setClassId] = useState(initialClassId);
  const [taskId, setTaskId] = useState("");
  const [studentId, setStudentId] = useState(initialStudentId);

  // 带了 student_id 就直接落到个体诊断，否则看班级总览
  const [tab, setTab] = useState<Tab>(initialStudentId ? "student" : "class");
  const [contextLoading, setContextLoading] = useState(true);
  const [error, setError] = useState("");
  // 改这个值即可强制三个子页重新拉数据，不必把 loader 提到本层
  const [reloadToken, setReloadToken] = useState(0);

  // 一门课可能带多个班，按 course_id 去重后作为课程下拉
  const courses = useMemo(() => {
    const seen = new Map<string, { course_id: string; title: string }>();
    assignments.forEach((item) => {
      if (!seen.has(item.course_id)) {
        seen.set(item.course_id, { course_id: item.course_id, title: item.title });
      }
    });
    return [...seen.values()];
  }, [assignments]);

  useEffect(() => {
    let alive = true;
    setContextLoading(true);
    setError("");
    getTeacherTeachingAssignments()
      .then((items) => {
        if (!alive) return;
        setAssignments(items);
        setCourseId((current) => current || items[0]?.course_id || "");
      })
      .catch(() => {
        if (alive) setError("无法读取当前教师的教学安排，请确认教师身份和后端服务。");
      })
      .finally(() => {
        if (alive) setContextLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  // 课程变了：班级和任务重新拉，下级选择清空
  useEffect(() => {
    if (!courseId) {
      setClasses([]);
      setTasks([]);
      return;
    }
    let alive = true;
    Promise.all([
      getDiagnosisClassOptions(courseId).catch(() => [] as DiagnosisClassOption[]),
      getDiagnosisTaskOptions(courseId).catch(() => [] as DiagnosisTaskOption[]),
    ]).then(([classOptions, taskOptions]) => {
      if (!alive) return;
      setClasses(classOptions);
      setTasks(taskOptions);
    });
    return () => {
      alive = false;
    };
  }, [courseId, reloadToken]);

  // 学生列表随课程和班级一起变
  useEffect(() => {
    if (!courseId) {
      setStudents([]);
      return;
    }
    let alive = true;
    getDiagnosisStudentOptions(courseId, classId || undefined)
      .then((items) => {
        if (!alive) return;
        setStudents(items);
        // 当前选中的学生若不在新范围内，清掉，避免拿着越权 ID 请求
        setStudentId((current) =>
          current && items.some((item) => item.student_id === current) ? current : ""
        );
      })
      .catch(() => {
        if (alive) setStudents([]);
      });
    return () => {
      alive = false;
    };
  }, [courseId, classId, reloadToken]);

  const handleCourseChange = (value: string) => {
    setCourseId(value);
    setClassId("");
    setTaskId("");
    setStudentId("");
  };

  const handleClassChange = (value: string) => {
    setClassId(value);
    setTaskId("");
  };

  const openStudent = useCallback((id: string) => {
    setStudentId(id);
    setTab("student");
  }, []);

  const courseAssignments = useMemo(
    () => assignments.filter((item) => item.course_id === courseId),
    [assignments, courseId]
  );

  return (
    <div className="diagnosis-page">
      <header className="review-head">
        <div className="review-head-copy">
          <h1>学情诊断</h1>
          <p>
            真实提交、答题与进度经过后端确定性统计后生成图表，所有数字都能下钻到具体任务
            或学生。AI 不参与本页任何指标计算，也不会改分、认定抄袭或处罚学生。
          </p>
        </div>
        <div className="review-head-actions">
          <button
            className="review-back"
            type="button"
            onClick={() => setReloadToken((value) => value + 1)}
            disabled={contextLoading || !courseId}
          >
            <RefreshCw size={15} /> 刷新
          </button>
        </div>
      </header>

      {error ? <p className="review-message error">{error}</p> : null}

      <div className="diagnosis-context" aria-label="教学上下文">
        <label className="diagnosis-field">
          <span>课程</span>
          <select
            className="review-select"
            value={courseId}
            disabled={contextLoading || courses.length === 0}
            onChange={(event) => handleCourseChange(event.target.value)}
          >
            {courses.length === 0 ? <option value="">暂无课程</option> : null}
            {courses.map((course) => (
              <option value={course.course_id} key={course.course_id}>
                {course.title}
              </option>
            ))}
          </select>
        </label>

        <label className="diagnosis-field">
          <span>班级</span>
          <select
            className="review-select"
            value={classId}
            disabled={!courseId}
            onChange={(event) => handleClassChange(event.target.value)}
          >
            <option value="">全部班级（{classes.length} 个）</option>
            {classes.map((item) => (
              <option value={item.class_id} key={item.class_id}>
                {item.class_name}（{item.student_count} 人）
              </option>
            ))}
          </select>
        </label>

        <label className="diagnosis-field">
          <span>任务</span>
          <select
            className="review-select"
            value={taskId}
            disabled={!courseId || tab !== "class"}
            title={tab === "class" ? undefined : "任务筛选只作用于班级学情总览"}
            onChange={(event) => setTaskId(event.target.value)}
          >
            <option value="">全部任务（{tasks.length} 个）</option>
            {tasks.map((item) => (
              <option value={item.task_id} key={item.task_id}>
                {item.task_title}
              </option>
            ))}
          </select>
        </label>

        <label className="diagnosis-field">
          <span>学生</span>
          <select
            className="review-select"
            value={studentId}
            disabled={!courseId || students.length === 0}
            onChange={(event) => {
              setStudentId(event.target.value);
              if (event.target.value) setTab("student");
            }}
          >
            <option value="">未选择（{students.length} 人）</option>
            {students.map((item) => (
              <option value={item.student_id} key={item.student_id}>
                {item.student_name}
                {item.has_profile ? "" : "（无画像）"}
              </option>
            ))}
          </select>
        </label>

        {courseAssignments.length ? (
          <p className="diagnosis-context-note">
            {courseAssignments.length} 个教学班 ·{" "}
            {classId
              ? `已筛选 ${classes.find((item) => item.class_id === classId)?.class_name ?? ""}`
              : `合计 ${courseAssignments.reduce((sum, item) => sum + item.student_count, 0)} 名学生`}{" "}
            · {tasks.length} 个已发布任务
          </p>
        ) : null}
      </div>

      <div className="class-tabs diagnosis-tabs" role="group" aria-label="学情诊断分区">
        {TABS.map((item) => (
          <button
            type="button"
            key={item.key}
            className={tab === item.key ? "active" : ""}
            aria-pressed={tab === item.key}
            onClick={() => setTab(item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {contextLoading ? (
        <article className="profile-card diagnosis-chart skeleton-block" />
      ) : courses.length === 0 && !error ? (
        <div className="class-empty">
          <h2>当前教师还没有可访问的课程</h2>
          <p>
            课程、班级和学生都通过教学安排关联到教师账号。数据导入后会自动出现在上面的
            选择框里，不需要手动填写编号。
          </p>
        </div>
      ) : (
        <>
          {tab === "class" ? (
            <ClassOverview
              key={`class-${reloadToken}`}
              courseId={courseId}
              classId={classId || undefined}
              taskId={taskId || undefined}
              onOpenStudent={openStudent}
            />
          ) : null}
          {tab === "student" ? (
            <StudentDiagnosis
              key={`student-${reloadToken}`}
              courseId={courseId}
              classId={classId || undefined}
              studentId={studentId || undefined}
            />
          ) : null}
          {tab === "alerts" ? (
            <AlertCenter
              key={`alerts-${reloadToken}`}
              courseId={courseId}
              classId={classId || undefined}
              onOpenStudent={openStudent}
            />
          ) : null}
        </>
      )}
    </div>
  );
}
