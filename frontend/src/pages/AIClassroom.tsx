import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AlertCircle, ArrowLeft, ExternalLink, Loader2, MonitorPlay, RefreshCw } from "lucide-react";
import { api, type GeneratedResource, type OpenMaicClassroomExport } from "../api";
import { studentErrorMessage } from "../components/StudentState";

const OPENMAIC_RUNTIME_URL = String(import.meta.env.VITE_OPENMAIC_RUNTIME_URL ?? "").trim();

function buildRuntimeUrl(resourceId: string) {
  if (!OPENMAIC_RUNTIME_URL) return "";
  const url = new URL(OPENMAIC_RUNTIME_URL, window.location.origin);
  url.searchParams.set("codetrackBridge", "postMessage");
  url.searchParams.set("codetrackResourceId", resourceId);
  url.searchParams.set("codetrackOrigin", window.location.origin);
  return url.toString();
}

function postClassroomToRuntime(target: HTMLIFrameElement | null, payload: OpenMaicClassroomExport | null) {
  if (!target?.contentWindow || !payload) return;
  target.contentWindow.postMessage(
    {
      type: "codetrack:openmaic-classroom",
      version: 1,
      payload
    },
    "*"
  );
}

export default function AIClassroom() {
  const navigate = useNavigate();
  const { resourceId } = useParams();
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [resource, setResource] = useState<GeneratedResource | null>(null);
  const [classroomExport, setClassroomExport] = useState<OpenMaicClassroomExport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const runtimeUrl = useMemo(() => resourceId ? buildRuntimeUrl(resourceId) : "", [resourceId]);

  useEffect(() => {
    let alive = true;
    setResource(null);
    setClassroomExport(null);
    setError(null);
    setLoading(true);
    if (!resourceId) {
      setError("请先从资源中心选择一个 AI讲解课堂资源。");
      setLoading(false);
      return () => {
        alive = false;
      };
    }
    Promise.all([
      api.getGeneratedResource(resourceId),
      api.getOpenMaicClassroomExport(resourceId)
    ])
      .then(([item, exported]) => {
        if (!alive) return;
        if (item.resource_type !== "AI_CLASSROOM") {
          setError("这个资源不是 AI讲解课堂。");
          return;
        }
        setResource(item);
        setClassroomExport(exported);
      })
      .catch((err) => {
        if (!alive) return;
        setError(studentErrorMessage(err, "课堂资源加载失败，请回到资源中心重新进入。"));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [resourceId]);

  useEffect(() => {
    if (!classroomExport) return undefined;
    const timer = window.setInterval(() => {
      postClassroomToRuntime(iframeRef.current, classroomExport);
    }, 1400);
    return () => window.clearInterval(timer);
  }, [classroomExport]);

  function handleIframeLoad() {
    postClassroomToRuntime(iframeRef.current, classroomExport);
  }

  if (loading) {
    return (
      <div className="openmaic-bridge-page">
        <section className="openmaic-bridge-state">
          <Loader2 size={22} className="study-spin-icon" />
          <strong>正在读取 OpenMAIC 课堂资源...</strong>
        </section>
      </div>
    );
  }

  if (error || !resource || !classroomExport) {
    return (
      <div className="openmaic-bridge-page">
        <section className="openmaic-bridge-state">
          <AlertCircle size={24} />
          <strong>{error || "课堂资源结构不完整"}</strong>
          <span>请回到资源中心，从已保存的课堂资源重新进入。</span>
          <button type="button" onClick={() => navigate("/self-study/library")}>
            <ArrowLeft size={17} />
            返回资源中心
          </button>
        </section>
      </div>
    );
  }

  if (!runtimeUrl) {
    return (
      <div className="openmaic-bridge-page">
        <section className="openmaic-bridge-state openmaic-bridge-missing">
          <MonitorPlay size={26} />
          <strong>OpenMAIC runtime 尚未连接</strong>
          <span>
            当前页面已经停止使用 CodeTrack 自研课堂播放器。请配置
            <code>VITE_OPENMAIC_RUNTIME_URL</code>
            指向 OpenMAIC 子应用后再进入课堂。
          </span>
          <div className="openmaic-bridge-actions">
            <button type="button" onClick={() => navigate("/self-study/library")}>
              <ArrowLeft size={17} />
              返回资源中心
            </button>
            <button type="button" onClick={() => window.location.reload()}>
              <RefreshCw size={17} />
              重新检测
            </button>
          </div>
          <small>
            资源已保存：{resource.title}。OpenMAIC export endpoint:
            <code>/api/v1/student/resources/{resource.id}/openmaic-export</code>
          </small>
        </section>
      </div>
    );
  }

  return (
    <div className="openmaic-bridge-page runtime-connected">
      <header className="openmaic-bridge-header">
        <button type="button" onClick={() => navigate("/self-study/library")} aria-label="返回资源中心">
          <ArrowLeft size={18} />
        </button>
        <div>
          <span>
            <MonitorPlay size={16} />
            OpenMAIC 课堂工作区
          </span>
          <strong>{resource.title}</strong>
        </div>
        <a href={runtimeUrl} target="_blank" rel="noreferrer">
          <ExternalLink size={17} />
          独立打开
        </a>
      </header>
      <iframe
        ref={iframeRef}
        className="openmaic-bridge-frame"
        title={resource.title}
        src={runtimeUrl}
        allow="fullscreen; clipboard-read; clipboard-write; microphone; autoplay"
        onLoad={handleIframeLoad}
      />
    </div>
  );
}
