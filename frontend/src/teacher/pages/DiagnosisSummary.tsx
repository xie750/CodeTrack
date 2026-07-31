import { useEffect, useState } from "react";
import { Alert, Card, Select, Space, Spin, Tabs } from "antd";
import { getTeacherCourses } from "../teacherApi";
import type { TeacherCourse } from "../teacherTypes";
import ClassOverview from "./diagnosis/ClassOverview";
import StudentDiagnosis from "./diagnosis/StudentDiagnosis";
import AlertCenter from "./diagnosis/AlertCenter";

function DiagnosisSummary() {
  const [courseId, setCourseId] = useState<string>();
  const [taskId, setTaskId] = useState<string>();
  const [studentId, setStudentId] = useState<string>();
  const [classId, setClassId] = useState<string>();
  const [courses, setCourses] = useState<TeacherCourse[]>([]);
  const [loading, setLoading] = useState(false);
  const [optionError, setOptionError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    getTeacherCourses()
      .then((items) => {
        if (!active) return;
        setCourses(items);
        setCourseId((current) => current ?? items[0]?.course_id);
      })
      .catch(() => {
        if (active) setOptionError("无法读取当前教师的课程，请确认教师身份和后端服务。");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false };
  }, []);

  const handleCourseChange = (value: string) => {
    setCourseId(value);
    setClassId(undefined);
    setTaskId(undefined);
    setStudentId(undefined);
  };

  return (
    <div className="page-grid">
      <div className="page-lead">
        <h1>学情诊断</h1>
        <p>
          真实提交与成绩经过确定性统计后生成图表，再由 AI 提供解释和建议。
          AI 不会自动改分、认定抄袭或处罚学生。
        </p>
      </div>

      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap size="middle">
          <Select
            aria-label="课程"
            placeholder="选择课程"
            loading={loading}
            value={courseId}
            onChange={handleCourseChange}
            style={{ width: 220 }}
            options={courses.map((course) => ({ value: course.course_id, label: course.title }))}
          />
          <Select
            aria-label="班级"
            allowClear
            placeholder="全部班级"
            value={classId}
            onChange={(value) => {
              setClassId(value);
              setStudentId(undefined);
            }}
            disabled={!courseId}
            style={{ width: 180 }}
            options={[]} // TODO: 从后端获取班级列表
          />
          <Select
            aria-label="任务"
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder="全部任务"
            value={taskId}
            onChange={setTaskId}
            disabled={!courseId}
            style={{ width: 220 }}
            options={[]} // TODO: 从后端获取任务列表
          />
          <Select
            aria-label="学生"
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder="选择学生"
            value={studentId}
            onChange={setStudentId}
            disabled={!courseId}
            style={{ width: 220 }}
            options={[]} // TODO: 从后端获取学生列表
          />
          {loading && <Spin size="small" />}
        </Space>
      </Card>

      {optionError && <Alert type="error" showIcon message={optionError} style={{ marginBottom: 16 }} />}
      {!courses.length && !loading && !optionError && (
        <Alert
          type="info"
          showIcon
          message="当前教师还没有可访问的课程"
          description="课程、班级和学生会在数据库导入后自动出现在选择框中，不需要手动填写编号。"
          style={{ marginBottom: 16 }}
        />
      )}

      <Tabs
        items={[
          {
            key: "class",
            label: "班级学情总览",
            children: <ClassOverview courseId={courseId} classId={classId} taskId={taskId} />,
          },
          {
            key: "student",
            label: "个体诊断",
            children: <StudentDiagnosis courseId={courseId} studentId={studentId} classId={classId} />,
          },
          {
            key: "alerts",
            label: "预警中心",
            children: <AlertCenter courseId={courseId} classId={classId} />,
          },
        ]}
      />
    </div>
  );
}

export default DiagnosisSummary;
