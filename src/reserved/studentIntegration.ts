export type ReservedStudentIntegration = {
  id: string
  method: 'GET' | 'POST'
  path: string
  teacherTrigger: string
  studentConsumer: string
  status: 'reserved'
}

// These contracts are intentionally metadata-only. Teacher UI code must not
// execute student-side requests until the student application is integrated.
export const reservedStudentIntegrations: ReservedStudentIntegration[] = [
  {
    id: 'student-class-join',
    method: 'POST',
    path: '/api/v1/classes/{join_code}/join',
    teacherTrigger: '教师生成班级邀请码、链接或二维码',
    studentConsumer: '学生端提交加入班级申请',
    status: 'reserved',
  },
  {
    id: 'student-course-content',
    method: 'GET',
    path: '/api/v1/student/courses/{course_id}/content',
    teacherTrigger: '教师发布章节、资料和练习',
    studentConsumer: '学生端读取已发布课程内容',
    status: 'reserved',
  },
  {
    id: 'student-task-list',
    method: 'GET',
    path: '/api/v1/student/tasks',
    teacherTrigger: '教师发布任务',
    studentConsumer: '学生端读取本人可见任务列表',
    status: 'reserved',
  },
  {
    id: 'student-task-submit',
    method: 'POST',
    path: '/api/v1/student/tasks/{task_id}/submissions',
    teacherTrigger: '教师发布任务',
    studentConsumer: '学生端提交代码或作业',
    status: 'reserved',
  },
  {
    id: 'student-discussion-list',
    method: 'GET',
    path: '/api/v1/student/discussions',
    teacherTrigger: '教师发布课堂讨论',
    studentConsumer: '学生端读取已发布讨论',
    status: 'reserved',
  },
  {
    id: 'student-discussion-reply',
    method: 'POST',
    path: '/api/v1/student/discussions/{discussion_id}/replies',
    teacherTrigger: '教师开放课堂讨论',
    studentConsumer: '学生端发表讨论回复',
    status: 'reserved',
  },
]

export function reservedStudentRoute(pathname: string) {
  if (/^\/join\/[^/]+$/.test(pathname)) return reservedStudentIntegrations[0]
  if (pathname === '/student/discussions') return reservedStudentIntegrations[4]
  return null
}
