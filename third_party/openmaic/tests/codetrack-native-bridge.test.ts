import { describe, expect, it } from 'vitest';
import { buildCompleteScene } from '@openmaic/generation';
import { nativeScenes, type CodeTrackExport } from '../app/codetrack-bridge/bridge-schema';

describe('CodeTrack native classroom export', () => {
  it('preserves native elements, focus timing, audio and widget parameters without projection', () => {
    const scene = buildCompleteScene(
      { id: 'outline', type: 'slide', title: 'Loss', description: 'Compare errors', keyPoints: [], order: 1 },
      { elements: [
        { id: 'formula', type: 'latex', left: 30, top: 30, width: 300, height: 80, rotate: 0, latex: 'L=(y-p)^2', path: 'M0 0', viewBox: [300, 80], color: '#333333', strokeWidth: 1 },
        { id: 'line', type: 'line', left: 40, top: 200, width: 2, start: [0, 0], end: [200, 0], style: 'solid', color: '#333333', points: ['', 'arrow'] },
      ] },
      [
        { id: 'focus', type: 'spotlight', elementId: 'formula' },
        { id: 'speech', type: 'speech', text: '解释平方损失', audioId: 'speech-asset' },
        { id: 'board', type: 'wb_draw_latex', latex: 'p-y', x: 20, y: 50 },
      ], 'stage',
    );
    const payload = {
      schema: 'codetrack.openmaic.classroom.export.v1', runtime: 'openmaic',
      resource: { id: 'resource', title: 'Loss' }, scenes: [scene],
      metadata: { generation_pipeline: 'openmaic_native' },
    } as unknown as CodeTrackExport;
    expect(nativeScenes(payload)).toEqual([scene]);
    expect(nativeScenes(payload)?.[0]).toBe(scene);
    expect(nativeScenes({ ...payload, metadata: {} })).toBeNull();
  });

  it('rejects corrupt native scenes instead of turning them into blank slides', () => {
    expect(() => nativeScenes({
      schema: 'codetrack.openmaic.classroom.export.v1', runtime: 'openmaic',
      resource: { id: 'r', title: 'r' }, scenes: [{ type: 'slide' }],
      metadata: { generation_pipeline: 'openmaic_native' },
    })).toThrow('课堂数据不完整');
  });
});
