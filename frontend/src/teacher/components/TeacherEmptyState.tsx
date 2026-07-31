import { Empty } from "antd";

interface EmptyStateProps {
  description?: string;
}

export default function TeacherEmptyState({ description = "暂无数据" }: EmptyStateProps) {
  return <Empty description={description} />;
}
