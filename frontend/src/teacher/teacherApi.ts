import { request } from "../api";
import type {
  TeacherCourse,
  TeacherDashboardData,
  TeacherTeachingAssignment,
  TaskMonitorData,
  TeacherTimeline,
} from "./teacherTypes";

/**
 * 教师端 API
 * 统一使用学生端 request 方法
 * Token: codetrack.accessToken
 */

// 获取教师教学安排列表（一个班级一门课一行）
export const getTeacherTeachingAssignments = () =>
  request<TeacherTeachingAssignment[]>("/api/v1/teacher/teaching-assignments");

// 获取教师课程列表（按课程聚合，course_id 唯一）
export const getTeacherCourses = () =>
  request<TeacherCourse[]>("/api/v1/teacher/courses");

// 获取课程详情
export const getTeacherCourse = (courseId: string) =>
  request<TeacherCourse>(`/api/v1/teacher/courses/${encodeURIComponent(courseId)}`);

// 获取课程学生提交列表
export const getCourseSubmissions = (courseId: string) =>
  request<any[]>("/api/v1/teacher/courses/" + encodeURIComponent(courseId) + "/submissions");

// 获取任务监控数据
export const getTaskMonitor = (taskId: string) =>
  request<TaskMonitorData>(`/api/v1/teacher/tasks/${encodeURIComponent(taskId)}/monitor`);

// 获取提交时间线
export const getSubmissionTimeline = (submissionId: string) =>
  request<TeacherTimeline>(`/api/v1/teacher/submissions/${encodeURIComponent(submissionId)}/timeline`);

// 获取提交版本列表
export const getSubmissionVersions = (submissionId: string) =>
  request<any[]>(`/api/v1/submissions/${encodeURIComponent(submissionId)}/versions`);

// 获取版本执行结果
export const getVersionResults = (versionId: string) =>
  request<any>(`/api/v1/submission-versions/${encodeURIComponent(versionId)}/results`);

// 获取版本诊断
export const getVersionDiagnosis = (versionId: string) =>
  request<any>(`/api/v1/submission-versions/${encodeURIComponent(versionId)}/diagnosis`);

// 教师首页聚合数据
export const getTeacherDashboard = (teachingAssignmentId?: string) =>
  request<TeacherDashboardData>(teachingAssignmentId
    ? `/api/v1/teacher/dashboard?teaching_assignment_id=${encodeURIComponent(teachingAssignmentId)}`
    : "/api/v1/teacher/dashboard"
  );
