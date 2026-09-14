import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCompleteScene } from '@openmaic/generation';
import { sceneQualityErrors, reviewClassroom, applyReviewCorrections, repairSlideLayout } from './codetrack-generate.mjs';

function quizScene(question) {
  return buildCompleteScene(
    { id: 'quiz', type: 'quiz', title: 'Transfer', order: 1, keyPoints: [] },
    { questions: [question, { ...question, id: 'q2' }] },
    [{ id: 'speech', type: 'speech', text: 'Apply the same forward propagation steps to a new input and explain why each step is necessary.' }],
    'stage',
  );
}

test('native short-answer questions use a rubric, not choice answers', () => {
  const scene = quizScene({ id: 'q1', type: 'short_answer', question: 'Why is nonlinearity needed?', analysis: 'Composing affine maps remains affine.', commentPrompt: 'Explain composition and the XOR counterexample.', points: 10, hasAnswer: false });
  assert.deepEqual(sceneQualityErrors(scene), []);
  delete scene.content.questions[0].commentPrompt;
  assert.match(sceneQualityErrors(scene).join(' '), /rubric/);
});

test('multiple-choice answers must resolve to actual choices', () => {
  const scene = quizScene({ id: 'q1', type: 'single', question: 'What is sigmoid(0)?', options: [{ value: 'A', label: '0.5' }, { value: 'B', label: '0' }], answer: ['A'], analysis: '1 / (1 + exp(0)) = 0.5', points: 5, hasAnswer: true });
  assert.deepEqual(sceneQualityErrors(scene), []);
  scene.content.questions[0].answer = ['C'];
  assert.match(sceneQualityErrors(scene).join(' '), /actual options/);
});

test('blank slides and dangling highlights are not publishable', () => {
  const scene = buildCompleteScene(
    { id: 'slide', type: 'slide', title: 'Empty', order: 1, keyPoints: [] },
    { elements: [] },
    [{ id: 'speech', type: 'speech', text: 'Read the title.' }, { id: 'focus', type: 'spotlight', elementId: 'missing' }],
    'stage',
  );
  const errors = sceneQualityErrors(scene).join(' ');
  assert.match(errors, /too short/);
  assert.match(errors, /Unknown focus target/);
});

test('native slide layout repair keeps content in the viewport', () => {
  const scene = buildCompleteScene(
    { id: 'slide', type: 'slide', title: 'Layout', order: 1, keyPoints: [] },
    {
      elements: [
        { id: 'text', type: 'text', left: 940, top: 530, width: 160, height: 80, rotate: 0, content: '这是一个足够长的讲解框。', defaultFontName: 'Microsoft YaHei', defaultColor: '#333333' },
        { id: 'shape', type: 'shape', left: 80, top: 120, width: 200, height: 120, rotate: 0, viewBox: '0 0 200 120', path: '', fill: '#ffffff', fixedRatio: false },
        { id: 'text2', type: 'text', left: 320, top: 120, width: 200, height: 80, rotate: 0, content: '第二个概念。', defaultFontName: 'Microsoft YaHei', defaultColor: '#333333' },
        { id: 'text3', type: 'text', left: 560, top: 120, width: 200, height: 80, rotate: 0, content: '第三个概念。', defaultFontName: 'Microsoft YaHei', defaultColor: '#333333' },
      ],
      background: { type: 'solid', color: '#ffffff' },
    },
    [
      { id: 'speech', type: 'speech', text: '这个页面用具体元素解释问题、机制和结论。先观察右下角的文字框，确认它描述的是当前任务，再看左侧图形如何表示输入与输出的关系。这里的重点不是背诵标签，而是理解每个元素承担的教学作用：文字提出问题，图形呈现结构，后续的计算才能说明为什么得到这个结论。学习者还需要把同样的观察方法迁移到新的输入上，检查定义、计算步骤和最终判断是否彼此一致。遇到新题时，也要主动说明变量含义、单位和推理依据，不能只报出一个没有过程的答案。' },
      { id: 'focus1', type: 'spotlight', elementId: 'text' },
      { id: 'focus2', type: 'spotlight', elementId: 'shape' },
    ],
    'stage',
  );
  assert.match(sceneQualityErrors(scene).join(' '), /extends outside/);
  repairSlideLayout(scene);
  assert.deepEqual(sceneQualityErrors(scene), []);
  assert.equal(scene.content.canvas.elements[0].content, '这是一个足够长的讲解框。');
  assert.equal(scene.actions[1].elementId, 'text');
});

test('review failures are not silently marked as passing', async () => {
  const payload = { scenes: [{ id: 's' }], metadata: {} };
  await assert.rejects(reviewClassroom(payload, {}, async () => '{}'), /valid assessment/);
  await assert.rejects(reviewClassroom(payload, {}, async () => JSON.stringify({ issues: [{ sceneId: 'missing', reason: 'x', correction: 'y' }] })), /unknown page/);
  const result = await reviewClassroom(payload, {}, async () => '{"issues":[]}');
  assert.equal(result.metadata.content_review.status, 'passed');
  assert.equal(result.metadata.content_review.method, 'model_review');
});

test('review prompts contain learning context but never model credentials', async () => {
  const payload = { scenes: [], metadata: {} };
  await reviewClassroom(payload, { message: 'Learn loss', model: { api_key: 'never-send-this' } }, async (system, user) => {
    assert.equal(`${system}${user}`.includes('never-send-this'), false);
    assert.equal(user.includes('Learn loss'), true);
    return '{"issues":[]}';
  });
});

test('targeted corrections retain native actions and reject identity changes', () => {
  const scene = quizScene({ id: 'q1', type: 'single', question: 'sigmoid(0)?', options: [{ value: 'A', label: '0.5' }, { value: 'B', label: '0' }], answer: ['A'], analysis: 'One half', points: 5, hasAnswer: true });
  const payload = { scenes: [scene] };
  const patch = { sceneId: scene.id, patches: [{ section: 'questions', id: 'q1', set: { analysis: '1 / (1 + exp(0)) = 0.5' } }] };
  const fixed = applyReviewCorrections(payload, [patch]);
  assert.equal(fixed.scenes[0].content.questions[0].analysis, '1 / (1 + exp(0)) = 0.5');
  assert.equal(payload.scenes[0].content.questions[0].analysis, 'One half');
  assert.deepEqual(fixed.scenes[0].actions, scene.actions);
  patch.patches[0].set = { id: 'changed' };
  assert.throws(() => applyReviewCorrections(payload, [patch]), /unsupported field/);
});

test('review accepts the compact speech correction form', () => {
  const scene = quizScene({ id: 'q1', type: 'single', question: 'sigmoid(0)?', options: [{ value: 'A', label: '0.5' }, { value: 'B', label: '0' }], answer: ['A'], analysis: 'One half', points: 5, hasAnswer: true });
  const speech = '用一个完整的计算过程解释这个答案，并说明每一步的原因与适用条件。再把计算结果与选项逐项比较，指出常见误解以及遇到新输入时应如何复用这个判断方法。';
  const fixed = applyReviewCorrections({ scenes: [scene] }, [{ sceneId: scene.id, patches: [{ section: 'actions', id: 'speech', set: speech }] }]);
  assert.equal(fixed.scenes[0].actions[0].text, speech);
});
