'use client';

import { useCallback, useEffect, useState } from 'react';
import { Stage as ClassroomStage } from '@/components/stage';
import { MediaStageProvider } from '@/lib/contexts/media-stage-context';
import { ThemeProvider } from '@/lib/hooks/use-theme';
import { useStageStore } from '@/lib/store';
import type { Scene, Stage } from '@/lib/types/stage';
import type { Action } from '@/lib/types/action';
import type { PPTElement, Slide } from '@openmaic/dsl';

type CodeTrackExport = {
  schema: string;
  runtime: string;
  resource: {
    id: string;
    title: string;
    summary?: string;
    course_id?: string;
    knowledge_point?: string;
  };
  stage?: Record<string, unknown>;
  scenes?: Array<Record<string, unknown>>;
  metadata?: Record<string, unknown>;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
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
      viewBox: Array.isArray(item.viewBox) && item.viewBox.length === 2 ? item.viewBox as [number, number] : [100, 100],
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
    viewportSize: 1000,
    viewportRatio: 0.5625,
    theme: hasKeys(theme)
      ? theme as Slide['theme']
      : {
          backgroundColor: '#ffffff',
          themeColors: ['#2563eb', '#0f766e', '#f59e0b'],
          fontColor: '#172033',
          fontName: 'Microsoft YaHei',
        },
    background: hasKeys(background)
      ? background as Slide['background']
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
    actions: Array.isArray(raw.actions) ? raw.actions as Action[] : [],
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

function isCodeTrackExport(value: unknown): value is CodeTrackExport {
  const candidate = asRecord(value);
  return candidate.schema === 'codetrack.openmaic.classroom.export.v1' && candidate.runtime === 'openmaic';
}

export default function CodeTrackBridgePage() {
  const [stageId, setStageId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const applyExport = useCallback((payload: CodeTrackExport) => {
    const stage = normalizeStage(payload);
    const scenes = Array.isArray(payload.scenes)
      ? payload.scenes.map((scene, index) => normalizeScene(scene, index, stage.id))
      : [];
    if (!scenes.length) {
      setError('CodeTrack export has no scenes.');
      return;
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
    setStageId(stage.id);
    setError(null);
  }, []);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const envelope = asRecord(event.data);
      if (envelope.type !== 'codetrack:openmaic-classroom') return;
      const payload = envelope.payload;
      if (!isCodeTrackExport(payload)) {
        setError('Invalid CodeTrack classroom export.');
        return;
      }
      applyExport(payload);
    };
    window.addEventListener('message', onMessage);
    window.parent?.postMessage({ type: 'codetrack:openmaic-ready', version: 1 }, '*');
    return () => window.removeEventListener('message', onMessage);
  }, [applyExport]);

  return (
    <ThemeProvider>
      <MediaStageProvider value={stageId ?? 'codetrack-bridge'}>
        <div className="h-screen flex flex-col overflow-hidden">
          {error ? (
            <div className="flex-1 flex items-center justify-center bg-gray-50 dark:bg-gray-900">
              <p className="text-destructive">{error}</p>
            </div>
          ) : stageId ? (
            <ClassroomStage />
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
