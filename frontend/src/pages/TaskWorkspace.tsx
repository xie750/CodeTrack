import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import Editor from "@monaco-editor/react";
import * as THREE from "three";
import {
  Activity,
  ArrowLeft,
  BookOpen,
  Bot,
  Brain,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Circle,
  Code2,
  Database,
  Eye,
  FileSearch,
  GitBranch,
  Lightbulb,
  ListChecks,
  NotebookTabs,
  PanelRightClose,
  PanelRightOpen,
  Play,
  Save,
  ShieldCheck,
  Upload,
  Zap
} from "lucide-react";
import { api, LearningContext, TaskDetail, VersionResult, Diagnosis, Hint, AgentWorkflowRun } from "../api";
import StudentRouteBreadcrumb from "../components/StudentRouteBreadcrumb";
import avatarImg from "../assets/ui-home/avatar.png";
import { StudentState, studentErrorDetail, studentErrorMessage } from "../components/StudentState";

type PageProps = {
  taskId: string;
  assignmentId?: string;
  onBack: () => void;
};

type WorkspaceLayout = {
  problemRatio: number;
  editorRatio: number;
};

type WorkspaceMetrics = {
  gridWidth: number;
  centerHeight: number;
  aiWidth: number;
};

type RunState = "IDLE" | "QUEUED" | "RUNNING" | "DONE" | "ERROR";
type ResultPanelTab = "cases" | "results";
type AiPanelMode = "hint" | "town";

type TeacherTestCase = TaskDetail["test_cases"][number];
type AgentWorkflowStepItem = AgentWorkflowRun["steps"][number];
type TownFlowPhase = {
  stepName: string;
  title: string;
  detail: string;
};

const WORKSPACE_LAYOUT_KEY = "codetrack.taskWorkspace.layout.v1";
const DEFAULT_PROBLEM_WIDTH = 316;
const DEFAULT_EDITOR_HEIGHT = 407;
const DEFAULT_PROBLEM_RATIO = 0.31;
const DEFAULT_EDITOR_RATIO = 0.59;
const PROBLEM_MIN_WIDTH = 260;
const CENTER_MIN_WIDTH = 560;
const EDITOR_MIN_HEIGHT = 320;
const RESULT_MIN_HEIGHT = 220;
const SPLITTER_SIZE = 12;
const GRID_COLUMN_GAPS = 24;

const MONACO_LANGUAGE: Record<string, string> = {
  CPP: "cpp",
  PYTHON: "python",
  JAVA: "java",
  JAVASCRIPT: "javascript"
};

const TERMINAL_STATUSES = new Set([
  "SUCCEEDED",
  "COMPILE_ERROR",
  "RUNTIME_ERROR",
  "TIMEOUT",
  "RESOURCE_LIMIT",
  "SECURITY_REJECTED",
  "INFRASTRUCTURE_ERROR"
]);

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

function readWorkspaceLayout(): WorkspaceLayout {
  if (typeof window === "undefined") {
    return { problemRatio: DEFAULT_PROBLEM_RATIO, editorRatio: DEFAULT_EDITOR_RATIO };
  }
  try {
    const parsed = JSON.parse(window.localStorage.getItem(WORKSPACE_LAYOUT_KEY) ?? "{}") as Partial<WorkspaceLayout>;
    return {
      problemRatio: typeof parsed.problemRatio === "number" ? clamp(parsed.problemRatio, 0.18, 0.58) : DEFAULT_PROBLEM_RATIO,
      editorRatio: typeof parsed.editorRatio === "number" ? clamp(parsed.editorRatio, 0.34, 0.76) : DEFAULT_EDITOR_RATIO
    };
  } catch {
    return { problemRatio: DEFAULT_PROBLEM_RATIO, editorRatio: DEFAULT_EDITOR_RATIO };
  }
}

function resolveProblemWidth(metrics: WorkspaceMetrics | null, problemRatio: number) {
  if (!metrics) return DEFAULT_PROBLEM_WIDTH;
  const availableWidth = metrics.gridWidth - metrics.aiWidth - SPLITTER_SIZE - GRID_COLUMN_GAPS;
  const maxProblemWidth = Math.max(PROBLEM_MIN_WIDTH, availableWidth - CENTER_MIN_WIDTH);
  return Math.round(clamp(availableWidth * problemRatio, PROBLEM_MIN_WIDTH, maxProblemWidth));
}

function resolveEditorHeight(metrics: WorkspaceMetrics | null, editorRatio: number) {
  if (!metrics) return DEFAULT_EDITOR_HEIGHT;
  const availableHeight = metrics.centerHeight - SPLITTER_SIZE;
  const maxEditorHeight = Math.max(EDITOR_MIN_HEIGHT, availableHeight - RESULT_MIN_HEIGHT);
  return Math.round(clamp(availableHeight * editorRatio, EDITOR_MIN_HEIGHT, maxEditorHeight));
}

function compactJson(value: unknown) {
  return JSON.stringify(value);
}

function formatCaseValue(value: unknown) {
  if (value === null || value === undefined) return "教师保留";
  if (typeof value === "string") return value.trimEnd();
  return compactJson(value);
}

function visibilityLabel(visibility: string | undefined) {
  return visibility === "HIDDEN" ? "隐藏" : "公开";
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    PASSED: "通过",
    FAILED: "未通过",
    PENDING: "待运行"
  };
  return labels[status] ?? status;
}

function statusClass(status: string) {
  if (status === "PASSED") return "pass";
  if (status === "FAILED") return "fail";
  return "";
}

function agentStepMeta(stepName: string) {
  const meta: Record<string, { label: string; place: string; description: string; tone: string; icon: JSX.Element }> = {
    execution_evidence_agent: {
      label: "执行证据代理",
      place: "测试工坊",
      description: "读取编译输出、测试状态和失败证据。",
      tone: "blue",
      icon: <ListChecks size={16} />
    },
    error_classifier_agent: {
      label: "错因分类代理",
      place: "错因路口",
      description: "把失败用例归入可解释的错误类型。",
      tone: "orange",
      icon: <GitBranch size={16} />
    },
    knowledge_retrieval_agent: {
      label: "知识检索代理",
      place: "知识书库",
      description: "检索本课程可引用的知识来源。",
      tone: "green",
      icon: <BookOpen size={16} />
    },
    diagnosis_agent: {
      label: "代码诊断代理",
      place: "诊断塔",
      description: "综合证据和知识源生成错因解释。",
      tone: "violet",
      icon: <Brain size={16} />
    },
    citation_guard_agent: {
      label: "引用守卫代理",
      place: "引用门",
      description: "检查诊断是否绑定真实课程来源。",
      tone: "teal",
      icon: <ShieldCheck size={16} />
    },
    progressive_hint_agent: {
      label: "渐进提示代理",
      place: "提示站",
      description: "按层级生成提示，避免直接泄露答案。",
      tone: "amber",
      icon: <Lightbulb size={16} />
    },
    answer_leakage_guard_agent: {
      label: "答案泄露检查代理",
      place: "安全岗",
      description: "拦截过度接近标准答案的提示内容。",
      tone: "red",
      icon: <FileSearch size={16} />
    },
    profile_signal_agent: {
      label: "画像信号代理",
      place: "画像馆",
      description: "把本次表现转成学习画像更新信号。",
      tone: "slate",
      icon: <Database size={16} />
    }
  };
  return meta[stepName] ?? {
    label: stepName.replace(/_/g, " "),
    place: "协同节点",
    description: "记录该智能体节点的运行输入和输出摘要。",
    tone: "slate",
    icon: <Activity size={16} />
  };
}

function agentStatusLabel(status: string) {
  const labels: Record<string, string> = {
    RUNNING: "运行中",
    SUCCEEDED: "已完成",
    WARNING: "需关注",
    SKIPPED: "已跳过",
    FAILED: "失败"
  };
  return labels[status] ?? status;
}

function agentStatusClass(status: string) {
  if (status === "SUCCEEDED") return "done";
  if (status === "RUNNING") return "running";
  if (status === "WARNING") return "warn";
  if (status === "SKIPPED") return "skip";
  if (status === "FAILED") return "fail";
  return "idle";
}

function summarizeAgentValue(value: unknown): string {
  if (value === null || value === undefined) return "暂无摘要";
  if (typeof value === "string") return value || "暂无摘要";
  if (Array.isArray(value)) {
    return value.length ? value.map((item) => summarizeAgentValue(item)).join("；") : "暂无条目";
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (!entries.length) return "暂无摘要";
    return entries
      .slice(0, 5)
      .map(([key, item]) => `${key}: ${typeof item === "object" ? JSON.stringify(item) : String(item)}`)
      .join("；");
  }
  return String(value);
}

function agentTownWorldPosition(index: number) {
  const positions = [
    { x: -2.35, z: -1.35 },
    { x: 0, z: -1.35 },
    { x: 2.35, z: -1.35 },
    { x: 2.35, z: 0.25 },
    { x: 0, z: 0.25 },
    { x: -2.35, z: 0.25 },
    { x: -2.35, z: 1.7 },
    { x: 0, z: 1.7 },
  ];
  return positions[index] ?? { x: 2.35, z: 1.7 };
}

function agentTownToneColor(tone: string) {
  const colors: Record<string, number> = {
    blue: 0x5f8ff5,
    orange: 0xf4a44d,
    green: 0x50be83,
    violet: 0x8870e8,
    teal: 0x35b9c7,
    amber: 0xeac049,
    red: 0xe87575,
    slate: 0x8b9ab0
  };
  return colors[tone] ?? colors.blue;
}

function disposeThreeObject(object: THREE.Object3D) {
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const material = mesh.material;
    if (Array.isArray(material)) {
      material.forEach((item) => item.dispose());
    } else if (material) {
      material.dispose();
    }
  });
}

function createTownBox(width: number, height: number, depth: number, color: number, opacity = 1) {
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.72,
    metalness: 0.05,
    transparent: opacity < 1,
    opacity
  });
  return new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
}

function createTownPerson(color: number) {
  const group = new THREE.Group();
  const body = createTownBox(0.18, 0.32, 0.14, color);
  body.position.y = 0.3;
  const head = createTownBox(0.2, 0.2, 0.2, 0xf9d7b5);
  head.position.y = 0.58;
  const visor = createTownBox(0.16, 0.05, 0.03, 0x1e3555);
  visor.position.set(0, 0.6, 0.11);
  const leftLeg = createTownBox(0.06, 0.18, 0.08, 0x243955);
  leftLeg.position.set(-0.05, 0.09, 0);
  const rightLeg = createTownBox(0.06, 0.18, 0.08, 0x243955);
  rightLeg.position.set(0.05, 0.09, 0);
  group.add(body, head, visor, leftLeg, rightLeg);
  return group;
}

function createTownBuilding(meta: ReturnType<typeof agentStepMeta>, status: string) {
  const group = new THREE.Group();
  const color = agentTownToneColor(meta.tone);
  const base = createTownBox(0.58, 0.56, 0.58, color);
  base.position.y = 0.28;
  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(0.48, 0.28, 4),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(color).offsetHSL(0, -0.08, -0.18), roughness: 0.68 })
  );
  roof.position.y = 0.72;
  roof.rotation.y = Math.PI / 4;
  const door = createTownBox(0.14, 0.22, 0.035, 0x25364f);
  door.position.set(0, 0.12, 0.31);
  const windowA = createTownBox(0.1, 0.09, 0.035, 0xe9fbff);
  windowA.position.set(-0.16, 0.4, 0.31);
  const windowB = createTownBox(0.1, 0.09, 0.035, 0xe9fbff);
  windowB.position.set(0.16, 0.4, 0.31);
  const statusLight = createTownBox(0.12, 0.12, 0.12, status === "SUCCEEDED" ? 0x24c77a : status === "FAILED" ? 0xe25555 : status === "WARNING" ? 0xf0ad27 : 0x2d7df7);
  statusLight.position.set(0.23, 0.93, 0.18);
  statusLight.userData.pulse = status === "RUNNING" || meta.tone === "amber";
  group.add(base, roof, door, windowA, windowB, statusLight);
  return group;
}

function CyberHintTownScene({
  steps,
  activeStepId,
  hintJourneyKey
}: {
  steps: AgentWorkflowStepItem[];
  activeStepId: string | null;
  hintJourneyKey: number;
}) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const sceneStateRef = useRef<{
    current: THREE.Vector3;
    positionByStepId: Map<string, THREE.Vector3>;
    buildingByStepId: Map<string, THREE.Group>;
    student: THREE.Group;
    motion: { from: THREE.Vector3; to: THREE.Vector3; start: number; duration: number } | null;
  } | null>(null);
  const stepSignature = steps.map((step) => `${step.step_id}:${step.step_name}:${step.status}`).join("|");

  useEffect(() => {
    const host = mountRef.current;
    if (!host) return undefined;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf5fbff);
    const camera = new THREE.OrthographicCamera(-4, 4, 3, -3, 0.1, 80);
    camera.position.set(4.8, 5.3, 5.2);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.className = "agent-town-canvas";
    renderer.domElement.dataset.scene = "cyber-hint-town";
    host.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight(0xffffff, 0x9eb5d2, 2.2));
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.45);
    keyLight.position.set(3, 5, 4);
    scene.add(keyLight);

    const floor = createTownBox(6.4, 0.05, 4.7, 0xe8f5f2);
    floor.position.y = -0.03;
    scene.add(floor);
    const backWall = createTownBox(6.4, 1.35, 0.07, 0xeaf3ff, 0.86);
    backWall.position.set(0, 0.65, -2.38);
    const sideWall = createTownBox(0.07, 1.35, 4.7, 0xf4f8ff, 0.82);
    sideWall.position.set(-3.23, 0.65, 0);
    scene.add(backWall, sideWall);

    const grid = new THREE.GridHelper(6.2, 12, 0x73bdf8, 0xd6e6ef);
    grid.position.y = 0.01;
    scene.add(grid);

    const positionByStepId = new Map<string, THREE.Vector3>();
    const buildingByStepId = new Map<string, THREE.Group>();
    const stepPositions = steps.slice(0, 8).map((step, index) => {
      const position = agentTownWorldPosition(index);
      const vector = new THREE.Vector3(position.x, 0, position.z);
      positionByStepId.set(step.step_id, vector);
      return vector;
    });

    for (let index = 0; index < stepPositions.length - 1; index += 1) {
      const from = stepPositions[index];
      const to = stepPositions[index + 1];
      const horizontal = Math.abs(to.x - from.x) >= Math.abs(to.z - from.z);
      const road = createTownBox(
        horizontal ? Math.abs(to.x - from.x) + 0.68 : 0.18,
        0.035,
        horizontal ? 0.18 : Math.abs(to.z - from.z) + 0.68,
        0xd8e5ee
      );
      road.position.set((from.x + to.x) / 2, 0.02, (from.z + to.z) / 2);
      scene.add(road);
    }

    steps.slice(0, 8).forEach((step, index) => {
      const meta = agentStepMeta(step.step_name);
      const building = createTownBuilding(meta, step.status);
      const position = stepPositions[index];
      building.position.set(position.x, 0, position.z);
      building.userData.baseY = 0;
      scene.add(building);
      buildingByStepId.set(step.step_id, building);

      const agent = createTownPerson(agentTownToneColor(meta.tone));
      agent.scale.setScalar(0.72);
      agent.position.set(position.x + 0.48, 0, position.z + 0.42);
      agent.userData.baseX = agent.position.x;
      agent.userData.baseZ = agent.position.z;
      agent.userData.phase = index * 0.7;
      scene.add(agent);
    });

    const student = createTownPerson(0x176cf5);
    student.scale.setScalar(0.92);
    const firstTarget = positionByStepId.get(activeStepId ?? "") ?? stepPositions[0] ?? new THREE.Vector3(-2.35, 0, -1.35);
    const current = firstTarget.clone().add(new THREE.Vector3(0, 0, 0.58));
    student.position.copy(current);
    scene.add(student);

    sceneStateRef.current = {
      current,
      positionByStepId,
      buildingByStepId,
      student,
      motion: null
    };

    let frame = 0;
    const resize = () => {
      const width = Math.max(220, host.clientWidth);
      const height = Math.max(300, host.clientHeight);
      const aspect = width / height;
      const viewHeight = 5.8;
      camera.left = -viewHeight * aspect / 2;
      camera.right = viewHeight * aspect / 2;
      camera.top = viewHeight / 2;
      camera.bottom = -viewHeight / 2;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();

    const animate = (time: number) => {
      frame = window.requestAnimationFrame(animate);
      const state = sceneStateRef.current;
      if (state) {
        if (state.motion) {
          const raw = Math.min(1, (time - state.motion.start) / state.motion.duration);
          const eased = raw * raw * (3 - 2 * raw);
          state.current.lerpVectors(state.motion.from, state.motion.to, eased);
          const dx = state.motion.to.x - state.motion.from.x;
          const dz = state.motion.to.z - state.motion.from.z;
          if (Math.abs(dx) + Math.abs(dz) > 0.01) {
            state.student.rotation.y = Math.atan2(dx, dz);
          }
          if (raw >= 1) state.motion = null;
        }
        state.student.position.copy(state.current);
        state.student.position.y += Math.sin(time / 170) * 0.035;
      }

      scene.traverse((child) => {
        if (child.userData.highlight) {
          child.position.y = child.userData.baseY + Math.sin(time / 170) * 0.06;
          const scale = 1 + Math.sin(time / 190) * 0.035;
          child.scale.setScalar(scale);
        }
        if (child.userData.pulse) {
          child.scale.setScalar(1 + Math.sin(time / 180) * 0.08);
        }
        if (child.userData.baseX !== undefined) {
          child.position.x = child.userData.baseX + Math.sin(time / 520 + child.userData.phase) * 0.08;
          child.position.z = child.userData.baseZ + Math.cos(time / 650 + child.userData.phase) * 0.08;
          child.rotation.y += 0.012;
        }
      });

      renderer.render(scene, camera);
    };
    frame = window.requestAnimationFrame(animate);

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      sceneStateRef.current = null;
      disposeThreeObject(scene);
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [stepSignature]);

  useEffect(() => {
    const state = sceneStateRef.current;
    if (!state || !activeStepId) return;
    const target = state.positionByStepId.get(activeStepId);
    if (!target) return;
    state.buildingByStepId.forEach((building, stepId) => {
      building.userData.highlight = stepId === activeStepId;
      if (stepId !== activeStepId) {
        building.position.y = building.userData.baseY ?? 0;
        building.scale.setScalar(1);
      }
    });
    state.motion = {
      from: state.current.clone(),
      to: target.clone().add(new THREE.Vector3(0, 0, 0.58)),
      start: performance.now(),
      duration: 900
    };
  }, [activeStepId, stepSignature]);

  useEffect(() => {
    if (!hintJourneyKey) return;
    const state = sceneStateRef.current;
    if (!state) return;
    const hintStep = steps.find((step) => step.step_name === "progressive_hint_agent");
    const target = hintStep ? state.positionByStepId.get(hintStep.step_id) : null;
    if (!target) return;
    state.motion = {
      from: state.current.clone(),
      to: target.clone().add(new THREE.Vector3(0, 0, 0.58)),
      start: performance.now(),
      duration: 1500
    };
  }, [hintJourneyKey, steps]);

  return <div className="agent-town-scene" ref={mountRef} aria-label="三维智能体提示小镇" />;
}

function caseFields(testCase: TeacherTestCase | null) {
  if (!testCase) return [];
  if (!testCase.input_visible || testCase.input_summary === null) {
    return [{ name: "input", value: "教师保留，提交后仅显示判题状态" }];
  }
  const input = testCase.input_summary;
  if (typeof input === "object" && input !== null && !Array.isArray(input)) {
    return Object.entries(input).map(([name, value]) => ({ name, value: formatCaseValue(value) }));
  }
  return [{ name: "input", value: formatCaseValue(input) }];
}

function isPassed(result: VersionResult | null) {
  return Boolean(result?.tests.length) && result?.tests.every((test) => test.status === "PASSED");
}

function normalizeTaskDetail(rawTask: TaskDetail): TaskDetail {
  const rawSpec = rawTask.interface_spec as Partial<TaskDetail["interface_spec"]>;
  const publicTests = rawTask.public_tests ?? [];
  const testCases = rawTask.test_cases?.length
    ? rawTask.test_cases
    : publicTests.map((test) => ({
      test_case_id: test.test_case_id,
      name: test.name,
      visibility: test.visibility ?? "PUBLIC",
      required: test.required ?? true,
      input_summary: test.input_summary,
      input_visible: test.input_visible ?? true,
      expected_output: test.expected_output,
      expected_output_visible: test.expected_output_visible ?? true,
      expected_output_summary: test.expected_output_summary
    }));
  const defaultLanguage = rawSpec.default_language || rawTask.language || "CPP";
  const languageTemplates =
    rawSpec.language_templates && Object.keys(rawSpec.language_templates).length
      ? rawSpec.language_templates
      : { [defaultLanguage]: rawSpec.student_template ?? "" };
  const supportedLanguages =
    rawSpec.supported_languages?.length
      ? rawSpec.supported_languages
      : Object.keys(languageTemplates).length
        ? Object.keys(languageTemplates)
        : [defaultLanguage];
  const languageLabels =
    rawSpec.language_labels && Object.keys(rawSpec.language_labels).length
      ? rawSpec.language_labels
      : Object.fromEntries(supportedLanguages.map((language) => [language, language === "CPP" ? "C++17" : language]));

  return {
    ...rawTask,
    public_tests: publicTests,
    test_cases: testCases,
    interface_spec: {
      function_signature: rawSpec.function_signature ?? "",
      editable_region: rawSpec.editable_region ?? "FUNCTION_ONLY",
      student_template: rawSpec.student_template ?? languageTemplates[defaultLanguage] ?? "",
      rules: rawSpec.rules ?? [],
      runner_profile: rawSpec.runner_profile ?? "linked_list_delete_transform_v1",
      supported_languages: supportedLanguages,
      default_language: defaultLanguage,
      language_templates: languageTemplates,
      language_labels: languageLabels,
      comparison: rawSpec.comparison ?? "exact_json"
    }
  };
}

function AgentTownView({
  run,
  loading,
  error,
  latestResult,
  hints,
  activeStepId,
  onSelectStep,
  onRequestHint
}: {
  run: AgentWorkflowRun | null;
  loading: boolean;
  error: string | null;
  latestResult: VersionResult | null;
  hints: Hint[];
  activeStepId: string | null;
  onSelectStep: (stepId: string) => void;
  onRequestHint: () => Promise<Hint | null>;
}) {
  const steps = [...(run?.steps ?? [])].sort((a, b) => a.step_order - b.step_order);
  const activeStep = steps.find((step) => step.step_id === activeStepId) ?? steps[0] ?? null;
  const activeMeta = activeStep ? agentStepMeta(activeStep.step_name) : null;
  const finishedCount = steps.filter((step) => step.status === "SUCCEEDED").length;
  const sortedHints = [...hints].sort((a, b) => a.level - b.level);
  const latestHint = sortedHints[sortedHints.length - 1] ?? null;
  const hintStep = steps.find((step) => step.step_name === "progressive_hint_agent") ?? null;
  const failedTests = latestResult?.tests.filter((test) => test.status !== "PASSED") ?? [];
  const failedNames = failedTests.slice(0, 2).map((test) => test.name).join("、");
  const nextHintLevel = latestHint ? Math.min(3, latestHint.level + 1) : 1;
  const townFlowPhases: TownFlowPhase[] = [
    {
      stepName: "execution_evidence_agent",
      title: "读取测试证据",
      detail: failedTests.length
        ? `测试工坊读取到 ${failedTests.length} 个失败用例：${failedNames}${failedTests.length > 2 ? "等" : ""}。`
        : "测试工坊确认当前测试结果，先整理可用证据。"
    },
    {
      stepName: "error_classifier_agent",
      title: "定位错因",
      detail: "错因路口把失败现象归类，判断是否集中在边界、指针更新或普通删除逻辑。"
    },
    {
      stepName: "knowledge_retrieval_agent",
      title: "匹配知识点",
      detail: "知识书库把失败证据关联到课程知识点，避免提示脱离本题目标。"
    },
    {
      stepName: "diagnosis_agent",
      title: "形成诊断",
      detail: "诊断塔综合测试证据和知识来源，先确定本次提示应该指向哪个薄弱点。"
    },
    {
      stepName: "progressive_hint_agent",
      title: "生成提示",
      detail: `提示站准备生成第 ${nextHintLevel} 层提示，只给当前阶段需要的线索。`
    },
    {
      stepName: "answer_leakage_guard_agent",
      title: "安全检查",
      detail: "安全岗检查提示是否过度接近完整答案，保留引导而不是直接泄题。"
    }
  ];
  const [hintJourneyKey, setHintJourneyKey] = useState(0);
  const [activeFlowIndex, setActiveFlowIndex] = useState<number | null>(null);
  const [townMessage, setTownMessage] = useState(latestHint?.content ?? "点击按钮后，小镇会按“证据、错因、知识、诊断、提示、安全检查”的顺序展示提示生成过程。");
  const [townMotion, setTownMotion] = useState<"idle" | "moving">("idle");
  const townTimersRef = useRef<number[]>([]);
  const activeFlowPhase = activeFlowIndex === null ? null : townFlowPhases[activeFlowIndex] ?? null;

  useEffect(() => {
    if (latestHint?.content && townMotion === "idle") {
      setTownMessage((current) => (
        current.startsWith("最终提示：") || current.startsWith("当前提示：")
          ? current
          : `当前提示：${latestHint.content}`
      ));
    }
  }, [latestHint?.hint_id, latestHint?.content, townMotion]);

  useEffect(() => () => {
    townTimersRef.current.forEach((timer) => window.clearTimeout(timer));
  }, []);

  async function handleTownHintRequest() {
    if (!latestResult || townMotion === "moving") return;
    townTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    townTimersRef.current = [];
    setTownMotion("moving");
    const hintPromise = onRequestHint();

    townFlowPhases.forEach((phase, index) => {
      const timer = window.setTimeout(() => {
        const step = steps.find((item) => item.step_name === phase.stepName);
        if (step) onSelectStep(step.step_id);
        if (phase.stepName === "progressive_hint_agent" && hintStep) {
          setHintJourneyKey((current) => current + 1);
        }
        setActiveFlowIndex(index);
        setTownMessage(phase.detail);
      }, index * 850);
      townTimersRef.current.push(timer);
    });

    const finalTimer = window.setTimeout(async () => {
      const nextHint = await hintPromise;
      setTownMotion("idle");
      setActiveFlowIndex(null);
      if (nextHint?.content) {
        setTownMessage(`最终提示：${nextHint.content}`);
      } else if (latestHint?.content) {
        setTownMessage(`当前提示：${latestHint.content}`);
      } else {
        setTownMessage("提示暂时没有生成成功，可以回到文字提示查看诊断证据。");
      }
    }, townFlowPhases.length * 850 + 450);
    townTimersRef.current.push(finalTimer);
  }

  if (loading) {
    return (
      <section className="agent-town-empty">
        <Activity size={18} />
        <h3>协同轨迹读取中</h3>
        <p>正在整理本次诊断背后的智能体步骤。</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="agent-town-empty warn">
        <ShieldCheck size={18} />
        <h3>协同轨迹暂不可用</h3>
        <p>{error}</p>
      </section>
    );
  }

  if (!latestResult) {
    return (
      <section className="agent-town-empty">
        <Bot size={18} />
        <h3>等待一次提交</h3>
        <p>运行代码后，这里会展示诊断、提示和画像信号之间的协同过程。</p>
      </section>
    );
  }

  if (!run || !steps.length) {
    return (
      <section className="agent-town-empty">
        <FileSearch size={18} />
        <h3>等待协同记录</h3>
        <p>当前诊断还没有可展示的智能体运行轨迹，请先查看系统测试证据或重新提交。</p>
      </section>
    );
  }

  return (
    <div className="agent-town">
      <section className="agent-town-overview">
        <div>
          <span><Activity size={15} /> {agentStatusLabel(run.status)}</span>
          <strong>{finishedCount}/{steps.length} 个节点完成</strong>
        </div>
        <small>{run.model_provider ?? "COACH_WORKFLOW"} · {run.prompt_version ?? "workflow"}</small>
      </section>

      <section className="agent-town-map" aria-label="智能体提示小镇">
        <div className="agent-town-flow" aria-label="提示生成阶段">
          {townFlowPhases.map((phase, index) => (
            <span
              className={[
                activeFlowIndex === index ? "active" : "",
                activeFlowIndex !== null && index < activeFlowIndex ? "done" : ""
              ].filter(Boolean).join(" ")}
              key={phase.stepName}
            >
              {phase.title}
            </span>
          ))}
        </div>
        <CyberHintTownScene steps={steps} activeStepId={activeStep?.step_id ?? null} hintJourneyKey={hintJourneyKey} />
        <div className={`agent-town-bubble ${townMotion === "moving" ? "moving" : ""}`}>
          <span>{townMotion === "moving" ? activeFlowPhase?.title ?? "提示代理正在处理" : latestHint ? `第${latestHint.level}层提示` : "提示站待命"}</span>
          <p>{townMessage}</p>
        </div>
        <div className="agent-town-control">
          <button className="primary" type="button" disabled={!latestResult || townMotion === "moving"} onClick={handleTownHintRequest}>
            <Lightbulb size={15} /> {townMotion === "moving" ? "提示生成中" : latestHint && latestHint.level >= 3 ? "重放生成过程" : "让提示代理分析"}
          </button>
          <small>{townMotion === "moving" ? `当前阶段：${activeFlowPhase?.title ?? "智能体协同"}` : "小镇动画和文字提示使用同一份诊断结果"}</small>
        </div>
      </section>

      <section className="agent-town-directory" aria-label="选择智能体节点">
        {steps.map((step) => {
          const meta = agentStepMeta(step.step_name);
          const selected = activeStep?.step_id === step.step_id;
          return (
            <button
              className={selected ? "active" : ""}
              data-tone={meta.tone}
              type="button"
              key={step.step_id}
              onClick={() => onSelectStep(step.step_id)}
            >
              <span>{meta.icon}</span>
              <strong>{meta.place}</strong>
              <small>{agentStatusLabel(step.status)}</small>
            </button>
          );
        })}
      </section>

      {activeStep && activeMeta && (
        <section className="agent-town-detail">
          <div className="agent-detail-head">
            <span data-tone={activeMeta.tone}>{activeMeta.icon}</span>
            <div>
              <h3>{activeMeta.label}</h3>
              <p>{activeMeta.description}</p>
            </div>
          </div>
          <dl>
            <div>
              <dt>状态</dt>
              <dd>{agentStatusLabel(activeStep.status)}</dd>
            </div>
            <div>
              <dt>耗时</dt>
              <dd>{activeStep.duration_ms === null ? "瞬时" : `${activeStep.duration_ms} ms`}</dd>
            </div>
            <div>
              <dt>读取</dt>
              <dd>{summarizeAgentValue(activeStep.input_summary)}</dd>
            </div>
            <div>
              <dt>产出</dt>
              <dd>{summarizeAgentValue(activeStep.output_summary)}</dd>
            </div>
          </dl>
        </section>
      )}
    </div>
  );
}

export default function TaskWorkspace({ taskId, assignmentId, onBack }: PageProps) {
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [context, setContext] = useState<LearningContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const [aiCollapsed, setAiCollapsed] = useState(false);
  const [aiPanelMode, setAiPanelMode] = useState<AiPanelMode>("hint");
  const [layout, setLayout] = useState<WorkspaceLayout>(() => readWorkspaceLayout());
  const [metrics, setMetrics] = useState<WorkspaceMetrics | null>(null);
  const [selectedLanguage, setSelectedLanguage] = useState("CPP");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [sourceCode, setSourceCode] = useState("");
  const [runState, setRunState] = useState<RunState>("IDLE");
  const [runMessage, setRunMessage] = useState("等待提交");
  const [activeResultTab, setActiveResultTab] = useState<ResultPanelTab>("cases");
  const [selectedCaseIndex, setSelectedCaseIndex] = useState(0);
  const [latestResult, setLatestResult] = useState<VersionResult | null>(null);
  const [diagnosis, setDiagnosis] = useState<Diagnosis | null>(null);
  const [hints, setHints] = useState<Hint[]>([]);
  const [agentRun, setAgentRun] = useState<AgentWorkflowRun | null>(null);
  const [agentRunLoading, setAgentRunLoading] = useState(false);
  const [agentRunError, setAgentRunError] = useState<string | null>(null);
  const [activeAgentStepId, setActiveAgentStepId] = useState<string | null>(null);
  const [activeExecutionId, setActiveExecutionId] = useState<string | null>(null);
  const gridRef = useRef<HTMLElement | null>(null);
  const centerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    setErrorDetail(null);
    setTask(null);
    setLatestResult(null);
    setDiagnosis(null);
    setHints([]);
    setAgentRun(null);
    setAgentRunLoading(false);
    setAgentRunError(null);
    setActiveAgentStepId(null);
    setActiveResultTab("cases");
    setSelectedCaseIndex(0);

    Promise.allSettled([api.getTask(taskId, assignmentId), api.getLearningContext()])
      .then(([taskResult, contextResult]) => {
        if (!alive) return;
        if (taskResult.status === "fulfilled") {
          const nextTask = normalizeTaskDetail(taskResult.value);
          const defaultLanguage = nextTask.interface_spec.default_language || nextTask.language || "CPP";
          setTask(nextTask);
          setSelectedLanguage(defaultLanguage);
          setDrafts(nextTask.interface_spec.language_templates);
          setSourceCode(nextTask.interface_spec.language_templates[defaultLanguage] ?? nextTask.interface_spec.student_template);
          setRunState("IDLE");
          setRunMessage("等待提交");
        } else {
          setError(studentErrorMessage(taskResult.reason, "任务详情加载失败，请返回任务列表后重试。"));
          setErrorDetail(studentErrorDetail(taskResult.reason));
        }
        if (contextResult.status === "fulfilled") {
          setContext(contextResult.value);
        }
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [assignmentId, taskId]);

  useEffect(() => {
    window.localStorage.setItem(WORKSPACE_LAYOUT_KEY, JSON.stringify(layout));
  }, [layout]);

  useEffect(() => {
    if (!activeExecutionId) return undefined;
    const executionId = activeExecutionId;
    let cancelled = false;
    let timer: number | undefined;

    async function poll() {
      try {
        const status = await api.getExecution(executionId);
        if (cancelled) return;
        setRunMessage(status.status);
        setRunState(TERMINAL_STATUSES.has(status.status) ? "DONE" : "RUNNING");
        if (status.result_url && status.version_id) {
          const result = await api.getResults(status.version_id);
          if (cancelled) return;
          setLatestResult(result);
          setActiveResultTab("results");
          try {
            const refreshed = await api.getTask(taskId, assignmentId);
            if (!cancelled) {
              setTask((current) => current ? {
                ...current,
                current_progress: refreshed.current_progress,
                teacher_review: refreshed.teacher_review,
              } : current);
            }
          } catch {
            // 判题结果已经可用，教师反馈刷新失败不应遮挡学生结果。
          }
          if (result.diagnosis.status === "READY") {
            try {
              const nextDiagnosis = await api.getDiagnosis(result.version_id);
              if (!cancelled) {
                setDiagnosis(nextDiagnosis);
                setHints(nextDiagnosis.hint ? [{
                  hint_id: `${nextDiagnosis.diagnosis_id}-level-${nextDiagnosis.hint_level ?? 1}`,
                  diagnosis_id: nextDiagnosis.diagnosis_id,
                  level: nextDiagnosis.hint_level ?? 1,
                  content: nextDiagnosis.hint,
                  unlocked: true,
                  unlock_reason: "AUTO_LEVEL_1",
                  generated_at: "",
                  viewed_at: ""
                }] : []);
              }
            } catch {
              if (!cancelled) setDiagnosis(null);
            }
          }
          setActiveExecutionId(null);
          return;
        }
        timer = window.setTimeout(poll, 1200);
      } catch (caught) {
        if (!cancelled) {
          setRunState("ERROR");
          setRunMessage(caught instanceof Error ? caught.message : "执行状态读取失败");
          setErrorDetail(studentErrorDetail(caught));
          setActiveExecutionId(null);
        }
      }
    }

    poll();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [activeExecutionId]);

  useEffect(() => {
    const diagnosisId = diagnosis?.diagnosis_id ?? latestResult?.diagnosis.diagnosis_id;
    if (!diagnosisId) {
      setAgentRun(null);
      setAgentRunLoading(false);
      setAgentRunError(null);
      setActiveAgentStepId(null);
      return undefined;
    }

    let alive = true;
    setAgentRunLoading(true);
    setAgentRunError(null);
    api.getDiagnosisAgentRun(diagnosisId)
      .then((payload) => {
        if (!alive) return;
        setAgentRun(payload.run);
        setActiveAgentStepId(payload.run?.steps[0]?.step_id ?? null);
      })
      .catch((caught) => {
        if (!alive) return;
        setAgentRun(null);
        setActiveAgentStepId(null);
        setAgentRunError(caught instanceof Error ? caught.message : "协同轨迹读取失败。");
      })
      .finally(() => {
        if (alive) setAgentRunLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [diagnosis?.diagnosis_id, latestResult?.diagnosis.diagnosis_id]);

  useEffect(() => {
    const grid = gridRef.current;
    const center = centerRef.current;
    if (!grid || !center) return undefined;
    const activeGrid = grid;
    const activeCenter = center;

    let frame = 0;
    function measure() {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const gridRect = activeGrid.getBoundingClientRect();
        const centerRect = activeCenter.getBoundingClientRect();
        const aiWidth = activeGrid.querySelector(".program-ai")?.getBoundingClientRect().width ?? 0;
        setMetrics((current) => {
          const next = {
            gridWidth: Math.round(gridRect.width),
            centerHeight: Math.round(centerRect.height),
            aiWidth: Math.round(aiWidth)
          };
          return current &&
            current.gridWidth === next.gridWidth &&
            current.centerHeight === next.centerHeight &&
            current.aiWidth === next.aiWidth
            ? current
            : next;
        });
      });
    }

    const observer = new ResizeObserver(measure);
    observer.observe(activeGrid);
    observer.observe(activeCenter);
    const aiPanel = activeGrid.querySelector(".program-ai");
    if (aiPanel) observer.observe(aiPanel);
    window.addEventListener("resize", measure);
    measure();

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [aiCollapsed, loading, task, error]);

  const teacherCases = useMemo(() => task?.test_cases ?? [], [task]);
  const selectedCase = teacherCases[selectedCaseIndex] ?? teacherCases[0] ?? null;
  const selectedCaseFields = useMemo(() => caseFields(selectedCase), [selectedCase]);
  const resultRows = useMemo(() => {
    const resultByCase = new Map((latestResult?.tests ?? []).map((test) => [test.test_case_id, test]));
    const baseCases = teacherCases.length
      ? teacherCases
      : (latestResult?.tests ?? []).map((test) => ({
        test_case_id: test.test_case_id,
        name: test.name,
        visibility: test.visibility,
        required: true,
        input_summary: null,
        input_visible: false,
        expected_output: null,
        expected_output_visible: false,
        expected_output_summary: test.expected_output_summary
      }));
    return baseCases.map((testCase, index) => {
      const result = resultByCase.get(testCase.test_case_id);
      return {
        key: testCase.test_case_id,
        name: testCase.name || `Case ${index + 1}`,
        visibility: testCase.visibility,
        input: testCase.input_visible ? formatCaseValue(testCase.input_summary) : "教师保留",
        expected: testCase.expected_output_summary,
        actual: result?.actual_output ?? "-",
        status: result?.status ?? "PENDING",
        duration: result ? `${result.duration_ms} ms` : "-"
      };
    });
  }, [latestResult, teacherCases]);

  useEffect(() => {
    if (selectedCaseIndex >= teacherCases.length && teacherCases.length > 0) {
      setSelectedCaseIndex(0);
    }
  }, [selectedCaseIndex, teacherCases.length]);

  const knowledgeTags = task?.learning_objectives.length ? task.learning_objectives : ["等待任务知识点"];
  const studentName = context?.student.name ?? "学生";
  const problemWidth = resolveProblemWidth(metrics, layout.problemRatio);
  const editorHeight = resolveEditorHeight(metrics, layout.editorRatio);
  const workspaceStyle = {
    "--program-problem-width": `${problemWidth}px`,
    "--program-editor-height": `${editorHeight}px`
  } as CSSProperties;

  function updateCurrentDraft(value: string) {
    setSourceCode(value);
    setDrafts((current) => ({ ...current, [selectedLanguage]: value }));
  }

  function switchLanguage(language: string) {
    setDrafts((current) => ({ ...current, [selectedLanguage]: sourceCode }));
    setSelectedLanguage(language);
    setSourceCode(drafts[language] ?? task?.interface_spec.language_templates[language] ?? "");
    setLatestResult(null);
    setDiagnosis(null);
    setHints([]);
    setAgentRun(null);
    setAgentRunError(null);
    setActiveAgentStepId(null);
    setRunState("IDLE");
    setRunMessage("等待提交");
  }

  async function submitCode() {
    if (!task || runState === "QUEUED" || runState === "RUNNING") return;
    setRunState("QUEUED");
    setRunMessage("已提交，等待执行");
    setLatestResult(null);
    setDiagnosis(null);
    setHints([]);
    setAgentRun(null);
    setAgentRunLoading(false);
    setAgentRunError(null);
    setActiveAgentStepId(null);
    try {
      const response = await api.submitCode(task.task_id, selectedLanguage, sourceCode, assignmentId);
      setActiveExecutionId(response.execution_id);
      setRunMessage(response.status);
    } catch (caught) {
      setRunState("ERROR");
      setRunMessage(caught instanceof Error ? caught.message : "提交失败");
      setErrorDetail(studentErrorDetail(caught));
    }
  }

  async function requestNextHint(): Promise<Hint | null> {
    const diagnosisId = diagnosis?.diagnosis_id ?? latestResult?.diagnosis.diagnosis_id;
    if (!diagnosisId) return null;
    const highestLevel = hints.length ? Math.max(...hints.map((hint) => hint.level)) : 0;
    if (highestLevel >= 3) {
      return [...hints].sort((a, b) => b.level - a.level)[0] ?? null;
    }
    const nextLevel = Math.min(3, highestLevel + 1);
    try {
      const hint = await api.requestHint(diagnosisId, nextLevel);
      setHints((current) => current.some((item) => item.level === hint.level) ? current : [...current, hint]);
      return hint;
    } catch (caught) {
      setRunMessage(caught instanceof Error ? caught.message : "提示暂不可用");
      setErrorDetail(studentErrorDetail(caught));
      return null;
    }
  }

  function startProblemResize(event: PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    const grid = gridRef.current;
    if (!grid) return;
    const gridRect = grid.getBoundingClientRect();
    const aiWidth = grid.querySelector(".program-ai")?.getBoundingClientRect().width ?? 0;
    const availableWidth = gridRect.width - aiWidth - SPLITTER_SIZE - GRID_COLUMN_GAPS;
    const maxProblemWidth = Math.max(PROBLEM_MIN_WIDTH, availableWidth - CENTER_MIN_WIDTH);
    let frame = 0;
    document.documentElement.classList.add("workspace-resizing", "workspace-resizing-x");
    function handleMove(moveEvent: globalThis.PointerEvent) {
      const nextWidth = clamp(moveEvent.clientX - gridRect.left, PROBLEM_MIN_WIDTH, maxProblemWidth);
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        setLayout((current) => ({ ...current, problemRatio: clamp(nextWidth / availableWidth, 0.18, 0.58) }));
      });
    }
    function stopResize() {
      window.cancelAnimationFrame(frame);
      document.documentElement.classList.remove("workspace-resizing", "workspace-resizing-x");
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", stopResize);
      window.removeEventListener("pointercancel", stopResize);
    }
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", stopResize);
    window.addEventListener("pointercancel", stopResize);
  }

  function startEditorResize(event: PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    const center = centerRef.current;
    if (!center) return;
    const centerRect = center.getBoundingClientRect();
    const availableHeight = centerRect.height - SPLITTER_SIZE;
    const maxEditorHeight = Math.max(EDITOR_MIN_HEIGHT, availableHeight - RESULT_MIN_HEIGHT);
    let frame = 0;
    document.documentElement.classList.add("workspace-resizing", "workspace-resizing-y");
    function handleMove(moveEvent: globalThis.PointerEvent) {
      const nextHeight = clamp(moveEvent.clientY - centerRect.top, EDITOR_MIN_HEIGHT, maxEditorHeight);
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        setLayout((current) => ({ ...current, editorRatio: clamp(nextHeight / availableHeight, 0.34, 0.76) }));
      });
    }
    function stopResize() {
      window.cancelAnimationFrame(frame);
      document.documentElement.classList.remove("workspace-resizing", "workspace-resizing-y");
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", stopResize);
      window.removeEventListener("pointercancel", stopResize);
    }
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", stopResize);
    window.addEventListener("pointercancel", stopResize);
  }

  function handleProblemSplitterKey(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    setLayout((current) => ({ ...current, problemRatio: clamp(current.problemRatio + (event.key === "ArrowLeft" ? -0.02 : 0.02), 0.18, 0.58) }));
  }

  function handleEditorSplitterKey(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    setLayout((current) => ({ ...current, editorRatio: clamp(current.editorRatio + (event.key === "ArrowUp" ? -0.03 : 0.03), 0.34, 0.76) }));
  }

  return (
    <div className="program-shell" data-task-id={taskId} style={workspaceStyle}>
      <header className="program-topbar">
        <div className="program-brand">
          <span className="program-brand-mark ct-brand-mark" aria-hidden="true" />
          <span className="program-brand-copy">
            <strong>Code<span>Track</span></strong>
            <small>学生助学空间</small>
          </span>
        </div>
        <div className="program-top-actions">
          <div className="program-account" aria-label={`${studentName}账号`}>
            <img src={avatarImg} alt={`${studentName}头像`} />
            <span className="program-account-copy">
              <strong>{studentName}</strong>
              <small>学生端</small>
            </span>
          </div>
        </div>
      </header>

      <main className="program-page">
        {loading ? (
          <>
            <section className="program-head skeleton-block" />
            <section className="program-grid">
              <article className="program-card program-problem skeleton-block" />
              <div className="program-splitter vertical skeleton-block" />
              <div className="program-center">
                <article className="program-card program-editor skeleton-block" />
                <div className="program-splitter horizontal skeleton-block" />
                <article className="program-card program-result skeleton-block" />
              </div>
              <aside className="program-card program-ai skeleton-block" />
            </section>
          </>
        ) : error || !task ? (
          <StudentState
            kind="unavailable"
            title="任务暂不可用"
            description={error ?? "没有读取到当前任务详情。"}
            detail={errorDetail}
            actions={[{ label: "返回班级任务", onClick: onBack, icon: <ArrowLeft size={15} /> }]}
            className="program-card program-problem"
          />
        ) : (
          <>
            <section className="program-head">
              <div>
                <StudentRouteBreadcrumb
                  className="program-route-breadcrumb"
                  items={[
                    { label: "学习入口", to: "/" },
                    { label: "我的课程", to: "/" },
                    { label: task.course_id ? "课程任务" : "课程任务", to: task.course_id ? `/courses/${encodeURIComponent(task.course_id)}/tasks` : undefined },
                    { label: task.title }
                  ]}
                />
                <button className="program-back" type="button" onClick={onBack}><ArrowLeft size={16} /> 返回班级任务</button>
                <div className="program-title-line">
                  <h1>编程任务：{task.title}</h1>
                  <span>状态：<b>{latestResult?.submission_status ?? task.current_progress.status}</b></span>
                </div>
              </div>
            </section>

            <section className="program-grid" data-ai-collapsed={aiCollapsed ? "true" : "false"} ref={gridRef}>
              <article className="program-card program-problem">
                <h2>题目描述</h2>
                <p>{task.description}</p>

                <h2>函数说明</h2>
                <ul>
                  <li>签名：{task.interface_spec.function_signature}</li>
                  <li>编辑区域：{task.interface_spec.editable_region}</li>
                  <li>判题模式：{task.interface_spec.runner_profile}</li>
                </ul>

                <h2>公开样例</h2>
                {task.public_tests.length ? task.public_tests.map((test) => (
                  <div className="program-example" key={test.test_case_id}>
                    <p><b>{test.name}：</b>{compactJson(test.input_summary)}</p>
                    <p><b>期望输出：</b>{test.expected_output_summary}</p>
                  </div>
                )) : <p>暂无公开样例。</p>}

                <h2>规则</h2>
                <ul>
                  {task.interface_spec.rules.map((rule) => <li key={rule}>{rule}</li>)}
                </ul>

                <h2>知识点</h2>
                <div className="program-tags">{knowledgeTags.map((tag) => <span key={tag}>{tag}</span>)}</div>
              </article>

              <div className="program-splitter vertical" role="separator" aria-label="调整题目和代码区域宽度" aria-orientation="vertical" tabIndex={0} onPointerDown={startProblemResize} onKeyDown={handleProblemSplitterKey} onDoubleClick={() => setLayout((current) => ({ ...current, problemRatio: DEFAULT_PROBLEM_RATIO }))}>
                <span />
              </div>

              <div className="program-center" ref={centerRef}>
                <article className="program-card program-editor">
                  <header>
                    <h2>代码编辑器</h2>
                    <div>
                      <select value={selectedLanguage} onChange={(event) => switchLanguage(event.target.value)} aria-label="选择语言">
                        {task.interface_spec.supported_languages.map((language) => (
                          <option value={language} key={language}>{task.interface_spec.language_labels[language] ?? language}</option>
                        ))}
                      </select>
                    </div>
                  </header>
                  <div className="program-monaco">
                    <Editor
                      height="100%"
                      language={MONACO_LANGUAGE[selectedLanguage] ?? "plaintext"}
                      value={sourceCode}
                      theme="vs"
                      options={{
                        minimap: { enabled: false },
                        fontSize: 13,
                        lineHeight: 21,
                        scrollBeyondLastLine: false,
                        automaticLayout: true,
                        tabSize: 2
                      }}
                      onChange={(value) => updateCurrentDraft(value ?? "")}
                    />
                  </div>
                  <footer>
                    <button type="button" onClick={() => updateCurrentDraft(sourceCode)}><Save size={16} /> 保存草稿</button>
                    <button className="primary" type="button" disabled={runState === "QUEUED" || runState === "RUNNING"} onClick={submitCode}><Play size={16} /> 运行代码</button>
                    <button className="primary" type="button" disabled={runState === "QUEUED" || runState === "RUNNING"} onClick={submitCode}><Upload size={16} /> 提交判题</button>
                  </footer>
                </article>

                <div className="program-splitter horizontal" role="separator" aria-label="调整代码编辑器和测试结果高度" aria-orientation="horizontal" tabIndex={0} onPointerDown={startEditorResize} onKeyDown={handleEditorSplitterKey} onDoubleClick={() => setLayout((current) => ({ ...current, editorRatio: DEFAULT_EDITOR_RATIO }))}>
                  <span />
                </div>

                <article className="program-card program-result">
                  <header>
                    <nav>
                      <button className={activeResultTab === "cases" ? "active" : ""} type="button" onClick={() => setActiveResultTab("cases")}>测试用例</button>
                      <button className={activeResultTab === "results" ? "active" : ""} type="button" onClick={() => setActiveResultTab("results")}>测试结果</button>
                    </nav>
                    <div>执行状态：<b>{runMessage}</b></div>
                  </header>
                  {activeResultTab === "cases" ? (
                    <div className="program-case-panel">
                      {teacherCases.length ? (
                        <>
                          <div className="program-case-tabs" role="tablist" aria-label="教师测试用例">
                            {teacherCases.map((testCase, index) => (
                              <button
                                className={index === selectedCaseIndex ? "active" : ""}
                                type="button"
                                role="tab"
                                aria-selected={index === selectedCaseIndex}
                                key={testCase.test_case_id}
                                onClick={() => setSelectedCaseIndex(index)}
                              >
                                Case {index + 1}
                              </button>
                            ))}
                          </div>
                          <section className="program-case-detail">
                            <div className="program-case-title">
                              <strong>{selectedCase?.name ?? "测试用例"}</strong>
                              <span>{visibilityLabel(selectedCase?.visibility)}</span>
                            </div>
                            <div className="program-case-fields">
                              {selectedCaseFields.map((field) => (
                                <label key={field.name}>
                                  <span>{field.name} =</span>
                                  <code>{field.value}</code>
                                </label>
                              ))}
                            </div>
                            <label className="program-case-expected">
                              <span>expected =</span>
                              <code>{selectedCase?.expected_output_summary ?? "-"}</code>
                            </label>
                          </section>
                        </>
                      ) : (
                        <div className="program-result-empty">当前编程题还没有配置教师测试用例。</div>
                      )}
                    </div>
                  ) : (
                    <>
                      <table>
                        <thead><tr><th>测试点</th><th>输入</th><th>期望输出</th><th>你的输出</th><th>结果</th><th>耗时</th></tr></thead>
                        <tbody>
                          {resultRows.map((row) => (
                            <tr key={row.key}>
                              <td>{row.name}<small>{visibilityLabel(row.visibility)}</small></td>
                              <td>{row.input}</td>
                              <td>{row.expected}</td>
                              <td>{row.actual}</td>
                              <td className={statusClass(row.status)}>
                                <span>{row.status === "PASSED" ? <Check size={13} /> : <Circle size={12} fill="currentColor" />} {statusLabel(row.status)}</span>
                              </td>
                              <td>{row.duration}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {(latestResult?.execution.compiler_stderr || latestResult?.execution.compiler_stdout) && (
                        <div className="program-compiler-output">
                          <strong>编译输出</strong>
                          <pre>{latestResult.execution.compiler_stderr || latestResult.execution.compiler_stdout}</pre>
                        </div>
                      )}
                      <div className="program-pass">
                        <CheckCircle2 size={18} />
                        {isPassed(latestResult) ? "已通过全部测试，可以生成总结并更新学习画像。" : "提交后会按教师测试用例显示运行结果和 AI 诊断。"}
                      </div>
                    </>
                  )}
                </article>
              </div>

              <aside className={`program-card program-ai${aiCollapsed ? " collapsed" : ""}`} aria-label="AI学习助手" aria-expanded={!aiCollapsed}>
                <header>
                  <span><Bot size={22} /></span>
                  <h2>AI学习助手</h2>
                  <button className="program-ai-toggle" type="button" aria-label={aiCollapsed ? "展开AI学习助手" : "收起AI学习助手"} onClick={() => setAiCollapsed((value) => !value)}>
                    {aiCollapsed ? <PanelRightOpen size={17} /> : <PanelRightClose size={17} />}
                    <span className="sr-only">{aiCollapsed ? "展开AI学习助手" : "收起AI学习助手"}</span>
                  </button>
                </header>
                {!aiCollapsed && (
                  <>
                    <nav className="program-ai-tabs" aria-label="AI学习助手视图">
                      <button className={aiPanelMode === "hint" ? "active" : ""} type="button" onClick={() => setAiPanelMode("hint")}>文字提示</button>
                      <button className={aiPanelMode === "town" ? "active" : ""} type="button" onClick={() => setAiPanelMode("town")}>小镇提示</button>
                    </nav>
                    {aiPanelMode === "hint" ? (
                      <>
                        <section>
                          <h3>AI诊断总结</h3>
                          <p>{diagnosis?.explanation ?? (latestResult ? "当前版本暂无可用 AI 诊断，请先查看系统测试证据。" : "提交代码后，AI 会基于编译输出、失败用例和课程知识源给出诊断。")}</p>
                        </section>
                        <section>
                          <h3>系统证据</h3>
                          <ul>
                            <li><b>通过情况：</b>{latestResult ? `${latestResult.tests.filter((test) => test.status === "PASSED").length}/${latestResult.tests.length}` : "等待提交"}</li>
                            <li><b>编译状态：</b>{latestResult?.execution.compile_exit_code === 0 ? "通过" : latestResult ? "未通过" : "等待提交"}</li>
                            <li><b>语言：</b>{task.interface_spec.language_labels[selectedLanguage] ?? selectedLanguage}</li>
                          </ul>
                        </section>
                        <section className="program-hints">
                          <h3>分层提示</h3>
                          {hints.length ? [...hints].sort((a, b) => a.level - b.level).map((hint) => (
                            <article className="open" key={`${hint.diagnosis_id}-${hint.level}`}>
                              <div className="program-hint-title"><Lightbulb size={15} /> 第{hint.level}层提示</div>
                              <p>{hint.content}</p>
                            </article>
                          )) : (
                            <article>
                              <div className="program-hint-title"><Lightbulb size={15} /> 第1层提示</div>
                              <p>诊断生成后会先解锁方向性提示，不直接给完整答案。</p>
                            </article>
                          )}
                        </section>
                        <div className="hint-usage">
                          <p><Eye size={14} /> 第一层提示 <span>{hints.some((hint) => hint.level === 1) ? "已解锁" : "待诊断"}</span></p>
                          <p><Eye size={14} /> 第二层提示 <span>{hints.some((hint) => hint.level === 2) ? "已解锁" : "按需解锁"}</span></p>
                          <p><Eye size={14} /> 第三层提示 <span>{hints.some((hint) => hint.level === 3) ? "已解锁" : "按任务规则控制"}</span></p>
                        </div>
                        <footer>
                          <button className="primary" type="button" disabled={!diagnosis?.diagnosis_id} onClick={requestNextHint}><Lightbulb size={16} /> 获取下一层提示</button>
                        </footer>
                      </>
                    ) : (
                      <AgentTownView
                        run={agentRun}
                        loading={agentRunLoading}
                        error={agentRunError}
                        latestResult={latestResult}
                        hints={hints}
                        activeStepId={activeAgentStepId}
                        onSelectStep={setActiveAgentStepId}
                        onRequestHint={requestNextHint}
                      />
                    )}
                  </>
                )}
              </aside>
            </section>

            <section className="program-bottom-grid">
              <article className="program-card program-history">
                <header><h2>提交记录</h2></header>
                <table>
                  <thead><tr><th>状态</th><th>版本</th><th>执行</th><th>语言</th></tr></thead>
                  <tbody>
                    {latestResult ? (
                      <tr>
                        <td className={isPassed(latestResult) ? "pass" : "fail"}>{latestResult.submission_status}</td>
                        <td>v{latestResult.version_no}</td>
                        <td>{latestResult.execution.status}</td>
                        <td>{selectedLanguage}</td>
                      </tr>
                    ) : (
                      <tr><td colSpan={4}>暂无提交记录。提交代码后会显示真实版本历史。</td></tr>
                    )}
                  </tbody>
                </table>
              </article>

              <article className="program-card program-growth">
                <h2>能力成长 <span>i</span></h2>
                {knowledgeTags.slice(0, 3).map((item, index) => (
                  <div className="growth-row" key={item}>
                    <span className={index === 1 ? "orange" : index === 2 ? "blue" : ""}>{index === 0 ? <NotebookTabs size={17} /> : index === 1 ? <Zap size={17} /> : <Code2 size={17} />}</span>
                    <div><strong>{item}</strong><p>等待提交和诊断证据更新画像。</p><i><b style={{ width: isPassed(latestResult) ? "72%" : "0%" }} /></i></div>
                    <em>{isPassed(latestResult) ? "已更新" : "待更新"}</em>
                  </div>
                ))}
              </article>

              <article className="program-card program-error">
                <header><h2>错因分析</h2><span className="program-panel-meta">本题表现</span></header>
                <div className="error-layout">
                  <div className="error-donut"><strong>{latestResult?.tests.filter((test) => test.status === "FAILED").length ?? 0}<span>次</span></strong></div>
                  <div className="error-legend">
                    <p><i className="blue" /> 逻辑错误 <b>{latestResult ? "按失败用例归因" : "待提交"}</b></p>
                    <p><i className="red" /> 编译错误 <b>{latestResult?.execution.compile_exit_code === 0 ? "0次" : latestResult ? "1次" : "待提交"}</b></p>
                    <p><i className="orange" /> 超时问题 <b>{latestResult?.execution.status === "TIMEOUT" ? "1次" : "0次"}</b></p>
                    <p><i /> 其他问题 <b>{runState === "ERROR" ? "需要检查" : "0次"}</b></p>
                  </div>
                </div>
              </article>

              <article className="program-card program-advice">
                <h2>学习建议</h2>
                {knowledgeTags.slice(0, 3).map((item, index) => (
                  <div className={index === 0 ? "done" : index === 1 ? "warn" : "todo"} key={item}>
                    <span>{index === 0 ? <Check size={15} /> : <Circle size={15} />}</span>
                    <div><strong>复习{item}</strong><p>先对照公开样例自测，再根据系统证据逐步修正。</p></div>
                  </div>
                ))}
              </article>
            </section>
            {(task.teacher_review?.grade || task.teacher_review?.feedback.length) ? (
              <section className="program-card program-teacher-feedback">
                <header><h2>教师反馈</h2><span>已发布到本次任务</span></header>
                {task.teacher_review.grade && <div className="teacher-grade-summary"><strong>{task.teacher_review.grade.score}</strong><span> / 100</span><p>{task.teacher_review.grade.comment || "教师已发布成绩，暂无文字补充。"}</p></div>}
                {task.teacher_review.feedback.map((item) => <p className="teacher-feedback-item" key={item.id}>{item.content}</p>)}
              </section>
            ) : null}
          </>
        )}
      </main>
    </div>
  );
}
