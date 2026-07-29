export type DemoUserOption = {
  id: string;
  name: string;
  className: string;
  description: string;
};

export const DEMO_USERS: DemoUserOption[] = [
  {
    id: "user_student_001",
    name: "王同学",
    className: "软件工程 1 班",
    description: "链表边界处理薄弱，任务进行中"
  },
  {
    id: "user_student_002",
    name: "刘同学",
    className: "计科 1 班",
    description: "递归出口与栈匹配边界待巩固"
  }
];

const STORAGE_KEY = "codetrack.demoUserId";

export function getCurrentDemoUserId() {
  const saved = window.localStorage.getItem(STORAGE_KEY);
  return DEMO_USERS.some((user) => user.id === saved) ? saved! : DEMO_USERS[0].id;
}

export function setCurrentDemoUserId(userId: string) {
  window.localStorage.setItem(STORAGE_KEY, userId);
}

export function getDemoUser(userId: string) {
  return DEMO_USERS.find((user) => user.id === userId) ?? DEMO_USERS[0];
}

