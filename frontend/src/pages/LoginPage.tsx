import { useEffect, useState, type FormEvent } from "react";
import { Button, Input } from "antd";
import { AlertTriangle, ArrowRight, LockKeyhole, LogIn, RefreshCw, ShieldCheck, Sparkles, UserPlus, UserRound, X } from "lucide-react";
import { ApiRequestError, api, apiCache } from "../api";
import { setAccessToken, type AuthUser } from "../authSession";
import { markStudentOnboardingPending } from "../components/StudentOnboardingTour";
import { readStoredEntryTheme, StudentEntryMotionBackdrop, STUDENT_ENTRY_THEME_KEY, type StudentEntryTheme } from "./StudentEntryPortal";

type LoginPageProps = {
  onLogin: (user: AuthUser) => void;
};

type LoginIssue = {
  title: string;
  description: string;
  checklist: string[];
  detail?: string;
};

function loginIssueFromError(error: unknown, actionLabel = "登录"): LoginIssue {
  if (error instanceof ApiRequestError) {
    if (error.kind === "network" || error.kind === "server" || error.kind === "bad_response") {
      return {
        title: "暂时连接不上教学服务",
        description: "后端服务未启动或接口暂不可用，登录信息没有提交成功。",
        checklist: ["确认 FastAPI 后端已经启动", "后端恢复后点击下方按钮重新登录", "如果服务已启动，检查前端代理端口配置"],
        detail: error.rawMessage
      };
    }
    if (error.kind === "auth") {
      return {
        title: "账号信息需要确认",
        description: error.message,
        checklist: actionLabel === "注册"
          ? ["检查账号是否为 3-32 位英文字母、数字或下划线", "密码需为 8-32 位并至少包含字母和数字", "如果账号已存在，请切换到登录"]
          : ["检查账号和密码是否输入正确", "也可以点击下方演示账号快速填入账号", "连续失败时请重新刷新页面再试"],
        detail: error.code ? `${error.code}${error.requestId ? ` / ${error.requestId}` : ""}` : error.rawMessage
      };
    }
    if (error.kind === "forbidden") {
      return {
        title: "当前账号没有访问权限",
        description: error.message,
        checklist: ["切换到对应角色账号", "返回当前账号可访问的学生端或教师端页面", "需要演示时可使用下方预设账号"],
        detail: error.code
      };
    }
    return {
      title: `${actionLabel}没有完成`,
      description: error.message,
      checklist: [error.recovery ?? "请检查当前输入后重试。"],
      detail: error.rawMessage
    };
  }

  return {
    title: `${actionLabel}没有完成`,
    description: `系统暂时没有完成${actionLabel}，请稍后重试。`,
    checklist: ["确认网络和后端服务状态", `重新点击${actionLabel}按钮`],
    detail: error instanceof Error ? error.message : undefined
  };
}

function LoginIssueToast({ issue, loading, formId, actionLabel, onDismiss }: { issue: LoginIssue; loading: boolean; formId: string; actionLabel: string; onDismiss: () => void }) {
  const primaryTip = issue.checklist[0];

  return (
    <aside className="login-issue-toast" role="alert" aria-live="polite" aria-atomic="true">
      <div className="login-issue-toast-icon" aria-hidden="true">
        <AlertTriangle size={19} />
      </div>
      <div className="login-issue-toast-body">
        <div className="login-issue-toast-heading">
          <strong>{issue.title}</strong>
          <span>{actionLabel}未完成</span>
        </div>
        <p>{issue.description}</p>
        {primaryTip ? <span className="login-issue-toast-tip">{primaryTip}</span> : null}
        <div className="login-issue-toast-actions">
          <button className="login-toast-retry" type="submit" form={formId} disabled={loading}>
            <RefreshCw size={14} />
            {loading ? "正在重试" : `重试${actionLabel}`}
          </button>
          {issue.detail ? (
            <details className="login-toast-detail">
              <summary>技术信息</summary>
              <code>{issue.detail}</code>
            </details>
          ) : null}
        </div>
      </div>
      <button className="login-toast-close" type="button" aria-label="关闭登录提示" onClick={onDismiss}>
        <X size={16} />
      </button>
    </aside>
  );
}

function LoginThemeToggle({ theme, onThemeChange }: { theme: StudentEntryTheme; onThemeChange: (theme: StudentEntryTheme) => void }) {
  return (
    <div className="student-entry-theme-toggle login-theme-toggle" aria-label="登录背景风格切换">
      <button type="button" className={theme === "starmap" ? "active" : ""} aria-pressed={theme === "starmap"} onClick={() => onThemeChange("starmap")}>
        星图
      </button>
      <button type="button" className={theme === "cloud" ? "active" : ""} aria-pressed={theme === "cloud"} onClick={() => onThemeChange("cloud")}>
        云图
      </button>
    </div>
  );
}

function registerPasswordIssue(password: string, username: string): string | null {
  if (password.length < 8 || password.length > 32) return "密码需为 8-32 位。";
  if (/\s/.test(password)) return "密码不能包含空格或换行。";
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return "密码需至少包含字母和数字。";
  if (username.trim() && password.toLowerCase().includes(username.trim().toLowerCase())) return "密码不能包含账号。";
  return null;
}

export default function LoginPage({ onLogin }: LoginPageProps) {
  const [username, setUsername] = useState("wang");
  const [password, setPassword] = useState("codetrack123");
  const [registerDisplayName, setRegisterDisplayName] = useState("");
  const [registerUsername, setRegisterUsername] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [registerPasswordConfirm, setRegisterPasswordConfirm] = useState("");
  const [registerRole, setRegisterRole] = useState<"STUDENT" | "TEACHER">("STUDENT");
  const [loading, setLoading] = useState(false);
  const [loginIssue, setLoginIssue] = useState<LoginIssue | null>(null);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [entryTheme, setEntryTheme] = useState<StudentEntryTheme>(readStoredEntryTheme);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setLoginIssue(null);
    try {
      const result = await api.login(username, password);
      apiCache.clear();
      setAccessToken(result.access_token);
      markStudentOnboardingPending(result.user);
      onLogin(result.user);
    } catch (err) {
      setLoginIssue(loginIssueFromError(err, "登录"));
    } finally {
      setLoading(false);
    }
  }

  async function handleRegisterSubmit(event: FormEvent) {
    event.preventDefault();
    const passwordIssue = registerPasswordIssue(registerPassword, registerUsername);
    if (passwordIssue) {
      setLoginIssue({
        title: "密码规范需要确认",
        description: passwordIssue,
        checklist: ["使用 8-32 位密码", "至少同时包含字母和数字", "不要包含账号、空格或换行"]
      });
      return;
    }
    if (registerPassword !== registerPasswordConfirm) {
      setLoginIssue({
        title: "密码需要确认",
        description: "两次输入的密码不一致。",
        checklist: ["重新输入密码和确认密码", "确认密码需符合 8-32 位且包含字母和数字", "再点击立即注册"]
      });
      return;
    }
    setLoading(true);
    setLoginIssue(null);
    try {
      const result = await api.register({
        username: registerUsername,
        password: registerPassword,
        display_name: registerDisplayName,
        role: registerRole
      });
      apiCache.clear();
      setAccessToken(result.access_token);
      markStudentOnboardingPending(result.user);
      onLogin(result.user);
    } catch (err) {
      setLoginIssue(loginIssueFromError(err, "注册"));
    } finally {
      setLoading(false);
    }
  }

  function selectDemoAccount(nextUsername: string) {
    setUsername(nextUsername);
    setLoginIssue(null);
  }

  function changeAuthMode(nextMode: "login" | "register") {
    setAuthMode(nextMode);
    setLoginIssue(null);
  }

  function changeEntryTheme(nextTheme: StudentEntryTheme) {
    setEntryTheme(nextTheme);
    window.localStorage.setItem(STUDENT_ENTRY_THEME_KEY, nextTheme);
  }

  useEffect(() => {
    if (!loginIssue) return undefined;

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setLoginIssue(null);
      }
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [loginIssue]);

  return (
    <main className="login-page student-entry-page" data-entry-theme={entryTheme}>
      <div className="student-entry-backdrop" aria-hidden="true">
        <StudentEntryMotionBackdrop theme={entryTheme} />
        <span className="student-entry-grid" />
        <span className="student-entry-stream stream-a" />
        <span className="student-entry-stream stream-b" />
      </div>
      <LoginThemeToggle theme={entryTheme} onThemeChange={changeEntryTheme} />
      {loginIssue ? <LoginIssueToast issue={loginIssue} loading={loading} formId={authMode === "register" ? "register-form" : "login-form"} actionLabel={authMode === "register" ? "注册" : "登录"} onDismiss={() => setLoginIssue(null)} /> : null}

      <section className={`login-stage login-shell-stack ${authMode === "register" ? "show-register" : ""}`} aria-label="CodeTrack 账号入口">
        <article className="login-shell-card login-shell-login" aria-label="登录账号">
          <div className="login-shell-visual">
            <div className="login-brand">
              <span className="ct-brand-mark login-mark" aria-hidden="true" />
              <strong>
                Code<span>Track</span>
              </strong>
            </div>
            <div className="login-copy">
              <span className="login-kicker">
                <Sparkles size={15} />
                  AI 专业助学空间
              </span>
              <h1>欢迎进入 CodeTrack</h1>
              <p>连接课程任务、自主学习、AI 助学和个人学习资料沉淀。</p>
            </div>
            <div className="login-wave-visual" aria-hidden="true">
              <span className="login-wave-line wave-a" />
              <span className="login-wave-line wave-b" />
              <span className="login-mini-panel">
                <i />
                <i />
                <i />
                <b />
              </span>
              <span className="login-orbit-dot dot-a" />
              <span className="login-orbit-dot dot-b" />
              <span className="login-orbit-dot dot-c" />
            </div>
          </div>

          <div className="login-shell-form">
            <div className="login-auth-head">
              <div>
                <span>账号登录</span>
                <h2>登录账号</h2>
              </div>
              <div className="login-mode-toggle" aria-label="账号入口切换">
                <button type="button" className={authMode === "login" ? "active" : ""} aria-pressed={authMode === "login"} disabled={authMode === "register"} onClick={() => changeAuthMode("login")}>
                  登录
                </button>
                <button type="button" className={authMode === "register" ? "active" : ""} aria-pressed={authMode === "register"} disabled={authMode === "register"} onClick={() => changeAuthMode("register")}>
                  注册
                </button>
              </div>
            </div>

            <form id="login-form" className="login-form" onSubmit={handleSubmit}>
              <label>
                <span>账号</span>
                <Input
                  size="large"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  prefix={<UserRound size={18} />}
                  autoComplete="username"
                  placeholder="请输入账号"
                  disabled={authMode === "register"}
                />
              </label>
              <label>
                <span>密码</span>
                <Input.Password
                  size="large"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  prefix={<LockKeyhole size={18} />}
                  autoComplete="current-password"
                  placeholder="请输入密码"
                  disabled={authMode === "register"}
                />
              </label>
              <Button type="primary" htmlType="submit" size="large" loading={loading} disabled={authMode === "register"} icon={<LogIn size={18} />}>
                立即登录
              </Button>

              <div className="login-demo-accounts" aria-label="演示账号">
                <span>演示账号</span>
                <button type="button" onClick={() => selectDemoAccount("wang")}>王同学 / wang · 演示数据</button>
                <button type="button" onClick={() => selectDemoAccount("liu")}>刘同学 / liu · 初始状态</button>
                <button type="button" onClick={() => selectDemoAccount("teacher_wang")}>王老师 / teacher_wang · 演示数据</button>
                <button type="button" onClick={() => selectDemoAccount("teacher_li")}>李老师 / teacher_li · 初始状态</button>
              </div>
            </form>
          </div>
          <button className="login-card-peek-action" type="button" tabIndex={authMode === "login" ? -1 : 0} onClick={() => changeAuthMode("login")}>
            切换到登录
          </button>
        </article>

        <article className="login-shell-card login-shell-register" aria-label="注册账号">
          <div className="login-shell-visual">
            <div className="login-brand">
              <span className="ct-brand-mark login-mark" aria-hidden="true" />
              <strong>
                Code<span>Track</span>
              </strong>
            </div>
            <div className="login-copy">
              <span className="login-kicker">
                <UserPlus size={15} />
                AI 专业账号开通
              </span>
              <h1>创建 CodeTrack 账号</h1>
              <p>注册后按角色进入学生助学空间或教师工作台，未加入班级也可先使用自学与科研实践能力。</p>
            </div>
            <div className="login-wave-visual register" aria-hidden="true">
              <span className="login-wave-line wave-a" />
              <span className="login-wave-line wave-b" />
              <span className="login-mini-panel">
                <i />
                <i />
                <i />
                <b />
              </span>
              <span className="login-orbit-dot dot-a" />
              <span className="login-orbit-dot dot-b" />
              <span className="login-orbit-dot dot-c" />
            </div>
          </div>

          <div className="login-shell-form">
            <div className="login-auth-head">
              <div>
                <span>账号注册</span>
                <h2>注册账号</h2>
              </div>
              <div className="login-mode-toggle" aria-label="账号入口切换">
                <button type="button" className={authMode === "login" ? "active" : ""} aria-pressed={authMode === "login"} disabled={authMode === "login"} onClick={() => changeAuthMode("login")}>
                  登录
                </button>
                <button type="button" className={authMode === "register" ? "active" : ""} aria-pressed={authMode === "register"} disabled={authMode === "login"} onClick={() => changeAuthMode("register")}>
                  注册
                </button>
              </div>
            </div>

            <form id="register-form" className="login-form register-form" onSubmit={handleRegisterSubmit}>
              <label>
                <span>姓名</span>
                <Input
                  size="large"
                  value={registerDisplayName}
                  onChange={(event) => setRegisterDisplayName(event.target.value)}
                  prefix={<UserRound size={18} />}
                  autoComplete="name"
                  placeholder="请输入真实姓名"
                />
              </label>
              <label>
                <span>账号</span>
                <Input
                  size="large"
                  value={registerUsername}
                  onChange={(event) => setRegisterUsername(event.target.value)}
                  prefix={<ShieldCheck size={18} />}
                  autoComplete="username"
                  placeholder="3-32 位字母、数字或下划线"
                />
              </label>
              <div className="register-role-field">
                <span>账号角色</span>
                <div className="register-role-switch" aria-label="账号角色">
                  <button type="button" className={registerRole === "STUDENT" ? "active" : ""} aria-pressed={registerRole === "STUDENT"} onClick={() => setRegisterRole("STUDENT")}>
                    学生
                  </button>
                  <button type="button" className={registerRole === "TEACHER" ? "active" : ""} aria-pressed={registerRole === "TEACHER"} onClick={() => setRegisterRole("TEACHER")}>
                    教师
                  </button>
                </div>
                <small>{registerRole === "STUDENT" ? "注册后进入个人初始状态；加入班级后再开放班级课程任务。" : "注册后进入教师工作台，课程教学范围可继续配置。"}</small>
              </div>
              <label>
                <span>密码</span>
                <Input.Password
                  size="large"
                  value={registerPassword}
                  onChange={(event) => setRegisterPassword(event.target.value)}
                  prefix={<LockKeyhole size={18} />}
                  autoComplete="new-password"
                  placeholder="8-32 位，至少包含字母和数字"
                />
              </label>
              <label>
                <span>确认密码</span>
                <Input.Password
                  size="large"
                  value={registerPasswordConfirm}
                  onChange={(event) => setRegisterPasswordConfirm(event.target.value)}
                  prefix={<LockKeyhole size={18} />}
                  autoComplete="new-password"
                  placeholder="再次输入密码"
                />
              </label>
              <Button type="primary" htmlType="submit" size="large" loading={loading} icon={<ArrowRight size={18} />}>
                立即注册
              </Button>
            </form>
          </div>
          <button className="login-card-peek-action" type="button" tabIndex={authMode === "register" ? -1 : 0} onClick={() => changeAuthMode("register")}>
            切换到注册
          </button>
        </article>
      </section>
    </main>
  );
}
