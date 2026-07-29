import { useState, type FormEvent } from "react";
import { Alert, Button, Input } from "antd";
import { LockKeyhole, LogIn, UserRound } from "lucide-react";
import { api, apiCache } from "../api";
import { setAccessToken, type AuthUser } from "../authSession";

type LoginPageProps = {
  onLogin: (user: AuthUser) => void;
};

export default function LoginPage({ onLogin }: LoginPageProps) {
  const [username, setUsername] = useState("wang");
  const [password, setPassword] = useState("codetrack123");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const result = await api.login(username, password);
      apiCache.clear();
      setAccessToken(result.access_token);
      onLogin(result.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "登录失败，请检查账号和密码。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-panel" aria-label="CodeTrack 登录">
        <div className="login-brand">
          <span className="ct-brand-mark login-mark" aria-hidden="true" />
          <strong>
            Code<span>Track</span>
          </strong>
        </div>
        <div className="login-copy">
          <h1>登录学生助学系统</h1>
          <p>使用 SQLite seed 账号进入，系统会按登录身份加载班级、课程任务和学习画像。</p>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          <label>
            <span>账号</span>
            <Input
              size="large"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              prefix={<UserRound size={18} />}
              autoComplete="username"
              placeholder="wang"
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
              placeholder="codetrack123"
            />
          </label>
          {error ? <Alert type="error" message={error} showIcon /> : null}
          <Button type="primary" htmlType="submit" size="large" loading={loading} icon={<LogIn size={18} />}>
            登录
          </Button>
        </form>

        <div className="login-demo-accounts" aria-label="演示账号">
          <span>演示账号</span>
          <button type="button" onClick={() => setUsername("wang")}>王同学 / wang</button>
          <button type="button" onClick={() => setUsername("liu")}>刘同学 / liu</button>
        </div>
      </section>
    </main>
  );
}
