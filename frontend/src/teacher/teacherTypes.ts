// 教师端类型定义
// 基于学生端现有类型扩展

export type TeacherRole = "TEACHER" | "ADMIN";

// 教师课程简略信息
export interface TeacherCourse {
  course_id: string;
  title: string;
  description?: string;
  teacher_id: string;
  semester?: string;
  status?: string;
  student_count: number;
  task_count: number;
  created_at: string;
}

// 教学任务
export interface TeachingAssignment {
  teaching_assignment_id: string;
  teacher_id: string;
  course_id: string;
  class_id?: string;
  class_name?: string;
  semester: string;
  student_count: number;
  task_count: number;
}

// 教学安排行，是 TeacherCourse 的超集：课程字段 + 班级维度
export interface TeacherTeachingAssignment extends TeacherCourse {
  teaching_assignment_id: string;
  class_id: string;
  class_name: string;
}

// 学生任务进度状态（后端为大写枚举）
export type TeacherProgressStatus =
  | "NOT_STARTED"
  | "IN_PROGRESS"
  | "SUBMITTED"
  | "NEEDS_REVISION"
  | "COMPLETED";

// 任务监控中的单个学生行
export interface TaskMonitorRow {
  submission_id: string | null;
  student_id: string;
  student_name: string;
  status: TeacherProgressStatus;
  submission_status: string | null;
  version_count: number;
  highest_hint_level: number;
  latest_diagnosis_type: string | null;
  passed_at: string | null;
  last_submitted_at: string | null;
}

// 任务监控数据
export interface TaskMonitorData {
  task_id: string;
  task_title: string;
  course_id: string;
  course_name: string;
  total_students: number;
  submitted_count: number;
  in_progress_count: number;
  not_started_count: number;
  passed_count: number;
  submissions: TaskMonitorRow[];
}

// 教学首页聚合数据
export interface TeacherDashboardData {
  teacher: { id: string; name: string };
  stats: {
    course_count: number;
    student_count: number;
    task_count: number;
    pending_review_count: number;
    graded_count: number;
  };
  courses: TeacherCourse[];
  recent_submissions: Array<{
    submission_id: string;
    task_id: string;
    task_title: string;
    course_id: string;
    course_name: string;
    student_id: string;
    student_name: string;
    status: string;
    version_count: number;
    highest_hint_level: number;
    latest_diagnosis_type: string | null;
    passed_at: string | null;
    last_submitted_at: string | null;
  }>;
}

// 提交时间线
export interface TeacherTimeline {
  submission_id: string;
  student_id: string;
  student_name: string;
  task_id: string;
  task_title: string;
  events: Array<{
    event_id: string;
    type: string;
    version_id: string;
    execution_id?: string;
    occurred_at: string | null;
    summary: string;
  }>;
}
