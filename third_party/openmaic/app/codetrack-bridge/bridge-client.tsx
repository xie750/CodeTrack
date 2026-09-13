'use client';

import {
  Component,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ErrorInfo,
  type ReactNode,
} from 'react';
import { Stage as ClassroomStage } from '@/components/stage';
import { MediaStageProvider } from '@/lib/contexts/media-stage-context';
import { ThemeProvider } from '@/lib/hooks/use-theme';
import { useStageStore } from '@/lib/store';
import type { Scene, Stage } from '@/lib/types/stage';
import type { Action } from '@/lib/types/action';
import type { PPTElement, Slide } from '@openmaic/dsl';
import { asRecord, isCodeTrackExport, type CodeTrackExport } from './bridge-schema';

class BridgeErrorBoundary extends Component<
  { children: ReactNode; onError: (message: string) => void },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.props.onError(`${error.message}\n${errorInfo.componentStack}`);
  }

  render() {
    if (this.state.failed) return null;
    return this.props.children;
  }
}

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function number(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function hasKeys(value: Record<string, unknown>): boolean {
  return Object.keys(value).length > 0;
}

function normalizeElement(raw: unknown, index: number): PPTElement | null {
  const item = asRecord(raw);
  const kind = item.type === 'shape' ? 'shape' : 'text';
  const base = {
    id: text(item.id, `el_${index + 1}`).replace(/^[.#]/, ''),
    left: number(item.left, 80 + (index % 2) * 420),
    top: number(item.top, 90 + Math.floor(index / 2) * 160),
    width: number(item.width, 360),
    height: number(item.height, 120),
    rotate: number(item.rotate, 0),
  };

  if (kind === 'shape') {
    return {
      ...base,
      type: 'shape',
      viewBox:
        Array.isArray(item.viewBox) && item.viewBox.length === 2
          ? (item.viewBox as [number, number])
          : [100, 100],
      path: text(item.path, 'M 0 0 L 100 0 L 100 100 L 0 100 Z'),
      fixedRatio: Boolean(item.fixedRatio),
      fill: text(item.fill, '#dbeafe'),
    };
  }

  const content = text(item.content, text(item.text, text(item.label)));
  if (!content) return null;

  return {
    ...base,
    type: 'text',
    content,
    defaultFontName: text(item.defaultFontName, 'Microsoft YaHei'),
    defaultColor: text(item.defaultColor, '#172033'),
  };
}

function normalizeSlide(raw: unknown, sceneId: string): Slide {
  const canvas = asRecord(raw);
  const theme = asRecord(canvas.theme);
  const background = asRecord(canvas.background);
  const elements = Array.isArray(canvas.elements)
    ? canvas.elements.map(normalizeElement).filter((item): item is PPTElement => Boolean(item))
    : [];

  return {
    id: text(canvas.id, sceneId),
    viewportSize: number(canvas.viewportSize, 1000),
    viewportRatio: number(canvas.viewportRatio, 0.5625),
    theme: hasKeys(theme)
      ? (theme as unknown as Slide['theme'])
      : {
          backgroundColor: '#ffffff',
          themeColors: ['#2563eb', '#0f766e', '#f59e0b'],
          fontColor: '#172033',
          fontName: 'Microsoft YaHei',
        },
    background: hasKeys(background)
      ? (background as unknown as Slide['background'])
      : { type: 'solid', color: '#ffffff' },
    elements,
  };
}

function normalizeQuizContent(content: Record<string, unknown>) {
  const options = Array.isArray(content.options) ? content.options.map(asRecord) : [];
  const correct = options.find((option) => option.correct === true);
  const answer = text(content.answer, text(correct?.id, 'A'));

  return {
    type: 'quiz' as const,
    questions: [
      {
        id: 'q1',
        type: 'single' as const,
        question: text(content.question, '请选择正确答案。'),
        options: options.map((option, index) => ({
          label: text(option.label, `选项 ${index + 1}`),
          value: text(option.id, String.fromCharCode(65 + index)),
        })),
        answer: [answer],
        analysis: text(content.explanation, text(content.summary)),
        hasAnswer: true,
        points: 1,
      },
    ],
  };
}

function firstSlideElementId(content: Scene['content']): string {
  return content.type === 'slide' ? content.canvas.elements[0]?.id ?? 'slide_title' : 'slide_title';
}

function resolveSlideElementId(raw: Record<string, unknown>, content: Scene['content']): string {
  const requested = text(raw.elementId, text(raw.target));
  if (content.type !== 'slide') return requested || 'slide_title';
  if (requested && content.canvas.elements.some((element) => element.id === requested)) {
    return requested;
  }
  return firstSlideElementId(content);
}

function normalizeAction(
  raw: unknown,
  index: number,
  content: Scene['content'],
): Action | null {
  const item = asRecord(raw);
  const id = text(item.id, `action_${index + 1}`);
  const title = text(item.title);
  const actionText = text(item.text, text(item.content, title));
  const type = text(item.type, 'speech');

  if (type === 'speech') {
    if (!actionText) return null;
    return { id, type: 'speech', title, text: actionText };
  }

  if (type === 'spotlight' || type === 'laser') {
    if (content.type !== 'slide') {
      return actionText ? { id, type: 'speech', title, text: actionText } : null;
    }
    return { id, type, title, elementId: resolveSlideElementId(item, content) } as Action;
  }

  if (type === 'wb_draw_text') {
    if (!actionText) return null;
    return {
      id,
      type: 'wb_draw_text',
      title,
      content: actionText,
      x: number(item.x, 80),
      y: number(item.y, 90 + index * 64),
      width: number(item.width, 520),
      fontSize: number(item.fontSize, 18),
      color: text(item.color, '#172033'),
    };
  }

  if (type === 'discussion') {
    return {
      id,
      type: 'discussion',
      title,
      topic: text(item.topic, title || '课堂讨论'),
      prompt: actionText || undefined,
    };
  }

  if (type === 'widget_highlight' || type === 'widget_annotation' || type === 'widget_reveal') {
    return {
      id,
      type,
      title,
      target: text(item.target, '#concept'),
      content: actionText || undefined,
    } as Action;
  }

  if (type === 'widget_setState') {
    const state = asRecord(item.state);
    return {
      id,
      type: 'widget_setState',
      title,
      state: hasKeys(state) ? state : { target: text(item.target, 'concept') },
      content: actionText || undefined,
    };
  }

  return actionText ? { id, type: 'speech', title, text: actionText } : null;
}

function normalizeScene(raw: Record<string, unknown>, index: number, stageId: string): Scene {
  const content = asRecord(raw.content);
  const sceneId = text(raw.id, `scene_${index + 1}`);
  const type = text(raw.type, text(content.type, 'slide'));
  const normalizedContent =
    type === 'interactive'
      ? {
          type: 'interactive' as const,
          html: text(content.html),
          url: text(content.url),
          widgetType: 'simulation' as const,
          widgetConfig: { type: 'simulation' as const },
        }
      : type === 'quiz'
        ? normalizeQuizContent(content)
        : {
            type: 'slide' as const,
            schemaVersion: 1,
            canvas: normalizeSlide(content.canvas, sceneId),
          };

  return {
    id: sceneId,
    stageId,
    title: text(raw.title, `Scene ${index + 1}`),
    order: index,
    type: normalizedContent.type,
    content: normalizedContent,
    actions: Array.isArray(raw.actions)
      ? raw.actions
          .map((action, actionIndex) => normalizeAction(action, actionIndex, normalizedContent))
          .filter((action): action is Action => Boolean(action))
      : [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  } as Scene;
}

function normalizeStage(payload: CodeTrackExport): Stage {
  const stage = asRecord(payload.stage);
  const now = Date.now();

  return {
    id: text(stage.id, payload.resource.id),
    name: text(stage.name, payload.resource.title),
    description: text(stage.description, payload.resource.summary ?? ''),
    createdAt: now,
    updatedAt: now,
    languageDirective: text(stage.languageDirective, '使用中文，面向人工智能专业学生讲解。'),
    style: text(stage.style, 'clean technical classroom'),
    interactiveMode: true,
  };
}

function payloadIdentity(payload: CodeTrackExport): string {
  const stage = asRecord(payload.stage);
  return `${text(stage.id, payload.resource.id)}:${payload.resource.id}`;
}

function payloadFromEnvelope(value: unknown): CodeTrackExport | null {
  const envelope = asRecord(value);
  if (envelope.type !== 'codetrack:openmaic-classroom') return null;
  return isCodeTrackExport(envelope.payload) ? envelope.payload : null;
}

function payloadFromWindowName(): CodeTrackExport | null {
  if (typeof window === 'undefined' || !window.name) return null;

  try {
    return payloadFromEnvelope(JSON.parse(window.name));
  } catch {
    return null;
  }
}

function applyExportToStore(payload: CodeTrackExport): string {
  const stage = normalizeStage(payload);
  const scenes = Array.isArray(payload.scenes)
    ? payload.scenes.map((scene, index) => normalizeScene(scene, index, stage.id))
    : [];

  if (!scenes.length) {
    throw new Error('CodeTrack export has no scenes.');
  }

  const store = useStageStore.getState();
  store.setStage(stage);
  store.setScenes(scenes);
  store.setMode('playback');
  store.setOutlines([]);
  store.setGeneratingOutlines([]);
  store.setGenerationComplete(true);
  store.setCurrentSceneId(scenes[0].id);
  useStageStore.setState({ isOwner: false, readOnly: true, generationStatus: 'completed' });

  return stage.id;
}

export function CodeTrackBridgeClient({
  initialPayload,
  initialError,
}: {
  initialPayload: CodeTrackExport | null;
  initialError: string | null;
}) {
  const initialPayloadApplied = useRef(false);
  const appliedPayloadIdentity = useRef<string | null>(null);
  const [stageId, setStageId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(() => {
    if (initialError) return initialError;
    return null;
  });

  const applyExport = useCallback((payload: CodeTrackExport) => {
    try {
      const identity = payloadIdentity(payload);
      if (appliedPayloadIdentity.current === identity) return;
      appliedPayloadIdentity.current = identity;
      setStageId(applyExportToStore(payload));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to apply CodeTrack classroom export.');
    }
  }, []);

  useEffect(() => {
    if (initialPayload && !initialPayloadApplied.current) {
      initialPayloadApplied.current = true;
      applyExport(initialPayload);
    }

    const namedPayload = payloadFromWindowName();
    if (namedPayload) {
      applyExport(namedPayload);
    }

    const onMessage = (event: MessageEvent) => {
      const payload = payloadFromEnvelope(event.data);
      if (!payload) {
        if (asRecord(event.data).type === 'codetrack:openmaic-classroom') {
          setError('Invalid CodeTrack classroom export.');
        }
        return;
      }
      applyExport(payload);
    };

    window.addEventListener('message', onMessage);
    window.parent?.postMessage({ type: 'codetrack:openmaic-ready', version: 1 }, '*');

    return () => {
      window.removeEventListener('message', onMessage);
    };
  }, [applyExport, initialPayload]);

  return (
    <ThemeProvider>
      <MediaStageProvider value={stageId ?? 'codetrack-bridge'}>
        <div className="h-screen flex flex-col overflow-hidden">
          {error ? (
            <div className="flex-1 flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-8 text-center">
              <p className="max-w-3xl whitespace-pre-wrap text-destructive">{error}</p>
            </div>
          ) : stageId ? (
            <BridgeErrorBoundary onError={setError}>
              <ClassroomStage classroomId={stageId} />
            </BridgeErrorBoundary>
          ) : (
            <div className="flex-1 flex items-center justify-center bg-gray-50 dark:bg-gray-900">
              <p className="text-muted-foreground">Waiting for CodeTrack classroom export...</p>
            </div>
          )}
        </div>
      </MediaStageProvider>
    </ThemeProvider>
  );
}
