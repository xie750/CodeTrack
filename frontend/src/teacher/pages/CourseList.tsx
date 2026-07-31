import { useEffect, useState } from "react";
import { Card, Row, Col, Button, Space, Tag, Input, Select, Empty } from "antd";
import { PlusOutlined, SearchOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import { getTeacherCourses } from "../teacherApi";
import type { TeacherCourse } from "../teacherTypes";
import TeacherEmptyState from "../components/TeacherEmptyState";

const { Search } = Input;

export default function CourseList() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [courses, setCourses] = useState<TeacherCourse[]>([]);
  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    async function loadCourses() {
      try {
        const data = await getTeacherCourses();
        setCourses(data);
      } catch (error) {
        console.error("Failed to load courses:", error);
      } finally {
        setLoading(false);
      }
    }
    loadCourses();
  }, []);

  const filteredCourses = courses.filter((course) => {
    const matchSearch = course.title.toLowerCase().includes(searchText.toLowerCase());
    const matchStatus = statusFilter === "all" || (course.status ?? "").toLowerCase() === statusFilter;
    return matchSearch && matchStatus;
  });

  const handleCreateCourse = () => {
    // TODO: 课程创建功能待后端接口完善后实现
    console.log("Create course");
  };

  if (loading) {
    return <div className="page-grid">加载中...</div>;
  }

  return (
    <div className="page-grid">
      <div className="page-lead">
        <h1>我的课程</h1>
        <p>管理您的教学课程和班级。</p>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 16 }}>
        <Space>
          <Search
            placeholder="搜索课程"
            prefix={<SearchOutlined />}
            style={{ width: 200 }}
            onSearch={setSearchText}
            onChange={(e) => setSearchText(e.target.value)}
            allowClear
          />
          <Select
            placeholder="课程状态"
            style={{ width: 120 }}
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { value: "all", label: "全部" },
              { value: "active", label: "进行中" },
              { value: "draft", label: "草稿" },
            ]}
          />
        </Space>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleCreateCourse}>
          创建课程
        </Button>
      </div>

      {filteredCourses.length === 0 ? (
        <TeacherEmptyState description="暂无课程" />
      ) : (
        <Row gutter={[16, 16]}>
          {filteredCourses.map((course) => (
            <Col xs={24} sm={12} lg={8} key={course.course_id}>
              <Card
                hoverable
                onClick={() => navigate(`/teacher/courses/${course.course_id}`)}
                title={course.title}
                extra={
                  <Tag color={(course.status ?? "").toLowerCase() === "active" ? "green" : "default"}>
                    {(course.status ?? "").toLowerCase() === "active" ? "进行中" : "草稿"}
                  </Tag>
                }
              >
                <p style={{ color: "#666", marginBottom: 16 }}>{course.description}</p>
                <Space direction="vertical" style={{ width: "100%" }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>学期：{course.semester || "未设置"}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>学生数：{course.student_count || 0}</span>
                    <span>任务数：{course.task_count || 0}</span>
                  </div>
                </Space>
              </Card>
            </Col>
          ))}
        </Row>
      )}
    </div>
  );
}
