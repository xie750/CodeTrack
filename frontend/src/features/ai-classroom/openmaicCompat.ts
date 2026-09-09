/*
 * OpenMAIC-compatible classroom contract for CodeTrack.
 *
 * This keeps the useful open-source boundary from OpenMAIC's MIT-licensed
 * design: material -> Stage -> Scene[] -> Action[] -> renderer. The rich scenes
 * below intentionally include interactive HTML widgets because OpenMAIC's
 * classroom feel comes from iframe-hosted simulations/games, not static slides.
 * Source: https://github.com/THU-MAIC/OpenMAIC
 */

export type AIClassroomElementId = "source" | "concept" | "curve" | "formula" | "code" | "summary" | "interactive";
export type OpenMaicSceneType = "slide" | "interactive" | "quiz";
export type OpenMaicWidgetType = "simulation" | "diagram" | "code" | "game" | "equation";

export type OpenMaicAction =
  | {
      id: string;
      type: "speech";
      title?: string;
      text: string;
      voice?: string;
      speed?: number;
    }
  | {
      id: string;
      type: "spotlight" | "laser" | "play_video";
      title?: string;
      elementId: AIClassroomElementId;
      dimOpacity?: number;
      color?: string;
    }
  | {
      id: string;
      type: "wb_open" | "wb_close" | "wb_clear";
      title?: string;
    }
  | {
      id: string;
      type: "wb_draw_text";
      title?: string;
      elementId?: string;
      content: string;
      x: number;
      y: number;
      width?: number;
      height?: number;
      fontSize?: number;
      color?: string;
    }
  | {
      id: string;
      type: "widget_highlight" | "widget_annotation" | "widget_reveal";
      title?: string;
      target: string;
      content?: string;
    }
  | {
      id: string;
      type: "widget_setState";
      title?: string;
      state: Record<string, unknown>;
      content?: string;
    }
  | {
      id: string;
      type: "discussion";
      title?: string;
      topic: string;
      prompt?: string;
      agentId?: string;
    };

export type OpenMaicSlideElement = {
  id: AIClassroomElementId;
  label: string;
  kind: "source" | "concept" | "chart" | "formula" | "code" | "question";
  text: string;
};

export type OpenMaicSlideContent = {
  type: "slide";
  title: string;
  summary: string;
  elements: OpenMaicSlideElement[];
};

export type OpenMaicInteractiveContent = {
  type: "interactive";
  title: string;
  summary: string;
  widgetType: OpenMaicWidgetType;
  widgetOutline: Record<string, unknown>;
  html: string;
};

export type OpenMaicQuizContent = {
  type: "quiz";
  title: string;
  summary: string;
  question: string;
  options: Array<{ id: string; label: string; correct?: boolean }>;
  explanation: string;
};

export type OpenMaicScene = {
  id: string;
  stageId: string;
  title: string;
  order: number;
  type: OpenMaicSceneType;
  content: OpenMaicSlideContent | OpenMaicInteractiveContent | OpenMaicQuizContent;
  actions: OpenMaicAction[];
};

export type OpenMaicClassroom = {
  stage: {
    id: string;
    name: string;
    description: string;
    createdAt: number;
    updatedAt: number;
    style: string;
    interactiveMode: boolean;
  };
  material: {
    fileName: string;
    mimeType: string;
    textPreview: string;
    parsedBy: "browser_text" | "file_metadata_fallback" | "demo_seed";
  };
  scenes: OpenMaicScene[];
  citations: string[];
};

export function actionLabel(action: OpenMaicAction) {
  if (action.type === "speech") return "语音讲解";
  if (action.type === "spotlight") return "区域高亮";
  if (action.type === "laser") return "激光指示";
  if (action.type === "play_video") return "内嵌视频";
  if (action.type.startsWith("wb_")) return "白板动作";
  if (action.type.startsWith("widget_")) return "互动组件";
  return "暂停互动";
}

export function focusTargetForAction(action: OpenMaicAction): AIClassroomElementId {
  if ("elementId" in action && typeof action.elementId === "string" && isClassroomElementId(action.elementId)) return action.elementId;
  if ("target" in action && typeof action.target === "string") {
    const normalized = action.target.replace(/^[.#]/, "");
    if (isClassroomElementId(normalized)) return normalized;
    return "interactive";
  }
  if (action.type === "wb_draw_text") return action.content.includes("lambda") || action.content.includes("正则") ? "formula" : "concept";
  if (action.type === "discussion") return "summary";
  if (action.type === "speech" && action.title?.includes("代码")) return "code";
  if (action.type === "speech" && action.title?.includes("曲线")) return "curve";
  if (action.type === "speech" && action.title?.includes("结论")) return "summary";
  return "source";
}

export function actionNarration(action: OpenMaicAction) {
  if (action.type === "speech") return action.text;
  if (action.type === "discussion") return action.prompt || action.topic;
  if ("content" in action && typeof action.content === "string") return action.content;
  return action.title || actionLabel(action);
}

export function actionWhiteboardNote(action: OpenMaicAction) {
  if (action.type === "wb_draw_text") return action.content;
  if (action.type === "discussion") return "请先回答判断依据，再选择下一步学习动作。";
  return undefined;
}

export async function generateClassroomFromFile(file?: File): Promise<OpenMaicClassroom> {
  if (!file) return generateClassroomFromMaterial("过拟合与正则化讲义.pdf", "训练误差、验证误差、模型复杂度、正则化、Ridge 回归。", "demo_seed", "application/pdf");
  const isReadableText = /^text\//.test(file.type) || /\.(md|markdown|txt|csv|json|py|ts|tsx|js|cpp|java)$/i.test(file.name);
  const text = isReadableText ? await file.text() : "";
  return generateClassroomFromMaterial(
    file.name,
    text || `${file.name}。当前前端兼容模式先读取文件元数据；接入后端解析器后会使用完整正文、图片和页码。`,
    isReadableText ? "browser_text" : "file_metadata_fallback",
    file.type || "application/octet-stream"
  );
}

export function generateClassroomFromPrompt(prompt: string, fileName = "AI 助学输入内容.txt"): OpenMaicClassroom {
  return generateClassroomFromMaterial(fileName, prompt, prompt.trim() ? "browser_text" : "demo_seed", "text/plain");
}

function generateClassroomFromMaterial(
  fileName: string,
  rawText: string,
  parsedBy: OpenMaicClassroom["material"]["parsedBy"],
  mimeType: string
): OpenMaicClassroom {
  const textPreview = compact(rawText, 190);
  const topic = inferTopic(fileName, rawText);
  const stageId = `ct_stage_${slug(topic.title)}`;
  const now = Date.now();
  const scenes: OpenMaicScene[] = [
    makeOpeningScene(stageId, topic, textPreview),
    makeConceptScene(stageId, topic),
    makeGameScene(stageId, topic),
    makeEquationScene(stageId, topic),
    makeQuizScene(stageId, topic)
  ];

  return {
    stage: {
      id: stageId,
      name: `${topic.title} AI讲解课堂`,
      description: `由 ${fileName} 生成的 OpenMAIC 兼容互动课堂对象。`,
      createdAt: now,
      updatedAt: now,
      style: "openmaic_like_interactive_workspace",
      interactiveMode: true
    },
    material: {
      fileName,
      mimeType,
      textPreview,
      parsedBy
    },
    citations: topic.citations,
    scenes
  };
}

type TopicProfile = ReturnType<typeof inferTopic>;

function makeOpeningScene(stageId: string, topic: TopicProfile, textPreview: string): OpenMaicScene {
  return {
    id: `${stageId}_scene_intro`,
    stageId,
    title: "资料导入与学习目标",
    order: 1,
    type: "slide",
    content: {
      type: "slide",
      title: topic.title,
      summary: "先把资料转成一节可播放课堂，再进入讲解、推演、交互和自测。",
      elements: [
        { id: "source", label: "资料片段", kind: "source", text: textPreview },
        { id: "concept", label: "学习目标", kind: "concept", text: topic.goal },
        { id: "summary", label: "课堂结构", kind: "question", text: "讲解页 -> 互动游戏 -> 方程验证 -> 课堂追问" }
      ]
    },
    actions: [
      { id: "intro_speech_1", type: "speech", title: "读取资料", text: topic.opening, voice: "concept_tutor", speed: 1 },
      { id: "intro_spotlight_source", type: "spotlight", title: "定位资料证据", elementId: "source", dimOpacity: 0.45 },
      { id: "intro_speech_2", type: "speech", title: "说明目标", text: `这节课的目标是：${topic.goal}`, voice: "concept_tutor", speed: 1 },
      { id: "intro_wb", type: "wb_draw_text", title: "写下课堂路线", content: "资料 -> 讲解 -> 互动 -> 验证 -> 总结", x: 70, y: 72, width: 560, fontSize: 20, color: "#0f766e" }
    ]
  };
}

function makeConceptScene(stageId: string, topic: TopicProfile): OpenMaicScene {
  return {
    id: `${stageId}_scene_concept`,
    stageId,
    title: "核心概念讲解",
    order: 2,
    type: "slide",
    content: {
      type: "slide",
      title: topic.title,
      summary: topic.summary,
      elements: [
        { id: "concept", label: "核心概念", kind: "concept", text: topic.concept },
        { id: "curve", label: "趋势图", kind: "chart", text: topic.chartText },
        { id: "formula", label: "关键规则", kind: "formula", text: topic.formula },
        { id: "code", label: "代码落点", kind: "code", text: topic.code }
      ]
    },
    actions: [
      { id: "concept_speech_1", type: "speech", title: "解释核心概念", text: topic.conceptLine, voice: "concept_tutor", speed: 1 },
      { id: "concept_spotlight_1", type: "spotlight", title: "高亮核心概念", elementId: "concept", dimOpacity: 0.42 },
      { id: "concept_curve", type: "widget_highlight", title: "观察曲线变化", target: "#curve", content: topic.chartLine },
      { id: "concept_wb", type: "wb_draw_text", title: "写下关键式", content: topic.formulaNote, x: 72, y: 72, width: 560, fontSize: 20, color: "#7c2d12" },
      { id: "concept_code", type: "speech", title: "代码说明", text: topic.codeLine, voice: "concept_tutor", speed: 1 },
      { id: "concept_code_spotlight", type: "spotlight", title: "定位代码落点", elementId: "code", dimOpacity: 0.42 }
    ]
  };
}

function makeGameScene(stageId: string, topic: TopicProfile): OpenMaicScene {
  return {
    id: `${stageId}_scene_game`,
    stageId,
    title: topic.gameTitle,
    order: 3,
    type: "interactive",
    content: {
      type: "interactive",
      title: topic.gameTitle,
      summary: topic.gameSummary,
      widgetType: "game",
      widgetOutline: {
        gameType: "strategy",
        challenge: topic.gameChallenge,
        playerControls: topic.gameControls
      },
      html: buildGameHtml(topic)
    },
    actions: [
      { id: "game_speech_1", type: "speech", title: "进入互动游戏", text: topic.gameIntro, voice: "concept_tutor", speed: 1 },
      { id: "game_widget_1", type: "widget_setState", title: "给出挑战目标", state: { pulse: "target" }, content: topic.gameChallenge },
      { id: "game_widget_2", type: "widget_highlight", title: "提示控制项", target: "#control-zone", content: `先调整：${topic.gameControls.join("、")}` },
      { id: "game_discussion", type: "discussion", title: "游戏追问", topic: topic.gameQuestion, prompt: topic.gameQuestion, agentId: "concept_tutor" }
    ]
  };
}

function makeEquationScene(stageId: string, topic: TopicProfile): OpenMaicScene {
  return {
    id: `${stageId}_scene_equation`,
    stageId,
    title: topic.equationTitle,
    order: 4,
    type: "interactive",
    content: {
      type: "interactive",
      title: topic.equationTitle,
      summary: topic.equationSummary,
      widgetType: "equation",
      widgetOutline: {
        equation: topic.formula,
        verification: topic.equationRule
      },
      html: buildEquationHtml(topic)
    },
    actions: [
      { id: "equation_speech_1", type: "speech", title: "验证公式", text: topic.equationIntro, voice: "concept_tutor", speed: 1 },
      { id: "equation_widget_1", type: "widget_setState", title: "高亮验证器", state: { pulse: "equation" }, content: topic.equationRule },
      { id: "equation_widget_2", type: "widget_annotation", title: "解释参数含义", target: "#equation-zone", content: topic.equationHint },
      { id: "equation_discussion", type: "discussion", title: "验证追问", topic: topic.question, prompt: topic.questionPrompt, agentId: "concept_tutor" }
    ]
  };
}

function makeQuizScene(stageId: string, topic: TopicProfile): OpenMaicScene {
  return {
    id: `${stageId}_scene_quiz`,
    stageId,
    title: "课堂总结与自测",
    order: 5,
    type: "quiz",
    content: {
      type: "quiz",
      title: "课堂总结与自测",
      summary: topic.summary,
      question: topic.question,
      options: topic.quizOptions,
      explanation: topic.questionPrompt
    },
    actions: [
      { id: "quiz_speech_1", type: "speech", title: "总结迁移", text: topic.summaryLine, voice: "concept_tutor", speed: 1 },
      { id: "quiz_discussion", type: "discussion", title: "暂停作答", topic: topic.question, prompt: topic.questionPrompt, agentId: "concept_tutor" }
    ]
  };
}

function inferTopic(fileName: string, text: string) {
  const source = `${fileName}\n${text}`;
  if (/链表|linked\s*list|deleteAt|head/i.test(source)) {
    return {
      title: "单链表删除节点",
      goal: "能用前驱指针解释删除节点，并处理头节点、尾节点和越界位置。",
      summary: "从头节点、尾节点和越界位置理解链表删除。",
      concept: "删除节点不是删除值，而是重连前驱节点的 next 指针。",
      chartText: "指针从 dummy 节点开始移动，避免头节点特判。",
      formula: "prev.next = prev.next.next",
      formulaNote: "关键不变量：prev 始终指向待删节点的前驱。",
      code: "dummy.next = head\nprev = dummy\nprev.next = prev.next.next",
      question: "为什么删除头节点时建议使用 dummy 节点？",
      questionPrompt: "如果没有 dummy 节点，删除第 0 个节点时返回值会发生什么变化？",
      opening: "我先根据上传资料识别出链表删除主题，今天重点讲清楚头节点和前驱指针两个位置。",
      conceptLine: "链表删除的核心不是把节点清空，而是让前一个节点跳过它。",
      chartLine: "图里高亮的是前驱指针移动过程，停在待删节点之前才安全。",
      codeLine: "代码里最关键的是 dummy.next 和 prev 的初始化，它决定头节点删除是否能正确返回。",
      gameTitle: "指针重连挑战",
      gameSummary: "拖动删除位置，观察 prev、target 和 next 的变化。",
      gameChallenge: "选择正确的前驱节点，让链表删除后仍然连续。",
      gameControls: ["删除位置", "前驱指针"],
      gameIntro: "现在进入一个小游戏：你要移动删除位置，并判断前驱指针应该停在哪里。",
      gameQuestion: "如果删除的是第一个真实节点，prev 应该指向谁？",
      equationTitle: "指针表达式验证器",
      equationSummary: "验证 prev.next = prev.next.next 在不同位置是否成立。",
      equationRule: "prev 必须存在，且 prev.next 是待删除节点。",
      equationHint: "dummy 节点让头节点也拥有统一的前驱。",
      equationIntro: "这一页不是 PPT，而是一个小验证器。你改变删除位置，公式会实时判断是否安全。",
      summaryLine: "把删除链表题做稳，关键是先找前驱，再改指向，最后返回 dummy.next。",
      quizOptions: [
        { id: "a", label: "因为 dummy 可以统一头节点删除逻辑", correct: true },
        { id: "b", label: "因为 dummy 会自动释放内存" },
        { id: "c", label: "因为 dummy 可以避免遍历链表" }
      ],
      citations: ["数据结构讲义 / 单链表", "任务工作区 / 删除节点测试", "学习画像 / 边界条件遗漏"]
    };
  }
  if (/stack|queue|栈|队列|括号/i.test(source)) {
    return {
      title: "栈与队列的适用场景",
      goal: "能根据访问顺序判断使用栈还是队列，并解释括号匹配为何需要栈。",
      summary: "从访问顺序理解 LIFO 与 FIFO。",
      concept: "栈关注最近未匹配的元素，队列关注最早进入的元素。",
      chartText: "入栈后从顶部弹出，入队后从队首取出。",
      formula: "Stack: last in, first out",
      formulaNote: "判断括号匹配时，栈顶元素必须和当前右括号成对。",
      code: "stack.append(ch)\nleft = stack.pop()\nreturn not stack",
      question: "为什么括号匹配不能直接用队列？",
      questionPrompt: "请用一个嵌套括号例子说明最近打开的括号为什么要最先关闭。",
      opening: "我识别到资料主题是栈和队列，先用访问顺序把两者区分开。",
      conceptLine: "栈解决的是最近依赖关系，队列解决的是公平排队顺序。",
      chartLine: "这里的互动图示会强调顶部弹出和队首弹出的差异。",
      codeLine: "括号匹配代码只需要关注栈顶，因为它对应最近尚未闭合的左括号。",
      gameTitle: "结构选择挑战",
      gameSummary: "把任务卡拖到栈或队列，观察顺序是否满足要求。",
      gameChallenge: "在最少尝试内，把括号匹配、排队服务、撤销操作放到正确结构。",
      gameControls: ["任务卡", "栈区域", "队列区域"],
      gameIntro: "这一页用游戏判断结构选择。你不是答选择题，而是把任务放进对应结构。",
      gameQuestion: "哪个任务必须优先处理最近加入的元素？",
      equationTitle: "出入顺序验证器",
      equationSummary: "验证 LIFO / FIFO 对给定序列的输出差异。",
      equationRule: "栈从尾部弹出，队列从头部弹出。",
      equationHint: "看输出序列，而不是看容器名字。",
      equationIntro: "现在用验证器改变入队/入栈序列，实时比较输出顺序。",
      summaryLine: "栈和队列不是按题目名字选，而是按依赖关系和处理顺序选。",
      quizOptions: [
        { id: "a", label: "括号匹配需要最近打开的括号先关闭", correct: true },
        { id: "b", label: "队列访问速度一定更慢" },
        { id: "c", label: "栈只能保存字符" }
      ],
      citations: ["数据结构讲义 / 栈与队列", "课程题库 / 括号匹配", "学习画像 / 数据结构选择混淆"]
    };
  }
  return {
    title: "过拟合与正则化",
    goal: "能用训练误差、验证误差和正则强度解释模型泛化能力。",
    summary: "从训练误差和验证误差的分化理解泛化风险。",
    concept: "模型记住训练样本中的偶然噪声，导致新样本表现变差。",
    chartText: "训练误差继续下降，验证误差开始回升。",
    formula: "L(w) + lambda ||w||2",
    formulaNote: "过拟合 = 训练误差低 + 泛化误差高；正则化用惩罚项限制复杂度。",
    code: "model = Ridge(alpha=0.8)\nmodel.fit(x_train, y_train)\nscore = model.score(x_valid, y_valid)",
    question: "为什么不能只看训练集准确率？",
    questionPrompt: "如果训练准确率 99%，验证准确率 71%，你会先怀疑数据划分、模型复杂度，还是评价指标？",
    opening: "我先把上传资料切成知识片段，今天抓一个核心问题：为什么训练集很好，测试集反而变差。",
    conceptLine: "过拟合的本质是模型对训练集太熟，对新数据不够稳。",
    chartLine: "看这条验证误差曲线，复杂度继续增加时，它没有继续下降，而是开始回升。",
    codeLine: "落到代码里，关键不是把训练分数刷满，而是保留验证集并调整 alpha 这类正则强度参数。",
    gameTitle: "正则化平衡挑战",
    gameSummary: "调节模型复杂度和正则强度，让验证误差落入目标区。",
    gameChallenge: "在 30 秒内把泛化分数推到 85 分以上，同时避免过拟合警报。",
    gameControls: ["模型复杂度", "lambda 正则强度"],
    gameIntro: "这一页是游戏：你要一边提高模型能力，一边控制过拟合风险。",
    gameQuestion: "当训练分很高但验证分下降时，你会提高还是降低 lambda？",
    equationTitle: "正则项验证器",
    equationSummary: "调节 lambda 和权重范数，实时观察损失函数如何变化。",
    equationRule: "lambda 越大，复杂权重受到的惩罚越强。",
    equationHint: "正则项不是让模型不学习，而是约束它不要记住噪声。",
    equationIntro: "现在验证公式。你拖动 lambda 和权重范数，右侧会实时计算惩罚项。",
    summaryLine: "过拟合判断要看验证集；正则化是用可控惩罚换更稳定的泛化。",
    quizOptions: [
      { id: "a", label: "训练集准确率高但验证集明显下降，可能过拟合", correct: true },
      { id: "b", label: "训练集准确率越高，模型一定越好" },
      { id: "c", label: "lambda 越大，模型一定越复杂" }
    ],
    citations: ["机器学习讲义 / 第 4 章 模型评估", "课程知识库 / 过拟合与泛化", "Python 实验模板 / Ridge 回归"]
  };
}

function buildGameHtml(topic: TopicProfile) {
  const isStructure = topic.title.includes("栈") || topic.title.includes("链表");
  return htmlDocument(`
    <main class="app game" data-pulse="">
      <section class="panel intro">
        <span>Interactive Game</span>
        <h1>${escapeHtml(topic.gameTitle)}</h1>
        <p>${escapeHtml(topic.gameChallenge)}</p>
      </section>
      <section class="playfield">
        <div class="target" id="target-zone">
          <b>${isStructure ? "目标结构" : "泛化目标区"}</b>
          <strong id="score">72</strong>
          <small id="status">等待调整参数</small>
        </div>
        <div class="track">
          <i id="trainLine"></i>
          <i id="validLine"></i>
          <span id="marker"></span>
        </div>
        <div class="tokens">
          <button type="button" data-choice="safe">${isStructure ? "前驱正确" : "泛化稳定"}</button>
          <button type="button" data-choice="risk">${isStructure ? "越界风险" : "过拟合警报"}</button>
          <button type="button" data-choice="retry">重新试一次</button>
        </div>
      </section>
      <section class="panel controls" id="control-zone">
        <label>${escapeHtml(topic.gameControls[0] ?? "控制项 A")}<input id="complexity" type="range" min="1" max="100" value="64" /></label>
        <label>${escapeHtml(topic.gameControls[1] ?? "控制项 B")}<input id="lambda" type="range" min="1" max="100" value="38" /></label>
        <button id="check" type="button">验证策略</button>
      </section>
    </main>
    <script>
      const root = document.querySelector('.app');
      const score = document.getElementById('score');
      const status = document.getElementById('status');
      const marker = document.getElementById('marker');
      const complexity = document.getElementById('complexity');
      const lambda = document.getElementById('lambda');
      function compute() {
        const c = Number(complexity.value);
        const l = Number(lambda.value);
        const balance = Math.max(0, 100 - Math.abs(c - 58) * 0.7 - Math.abs(l - 46) * 0.55);
        score.textContent = String(Math.round(balance));
        marker.style.left = Math.max(6, Math.min(92, c)) + '%';
        status.textContent = balance > 85 ? '策略命中，进入安全区' : balance > 70 ? '接近目标，再微调' : '风险偏高，继续尝试';
        root.dataset.state = balance > 85 ? 'win' : balance > 70 ? 'close' : 'risk';
      }
      complexity.addEventListener('input', compute);
      lambda.addEventListener('input', compute);
      document.getElementById('check').addEventListener('click', compute);
      document.querySelectorAll('[data-choice]').forEach((button) => {
        button.addEventListener('click', () => {
          status.textContent = button.textContent + '：请观察分数变化';
          if (button.dataset.choice === 'retry') { complexity.value = 50; lambda.value = 50; }
          compute();
        });
      });
      window.addEventListener('message', (event) => {
        const data = event.data || {};
        if (data.type === 'widget:setState' || data.type === 'widget:highlight') {
          root.dataset.pulse = data.pulse || data.target || 'target';
          setTimeout(() => { root.dataset.pulse = ''; }, 2200);
        }
      });
      compute();
    </script>
  `);
}

function buildEquationHtml(topic: TopicProfile) {
  return htmlDocument(`
    <main class="app equation" data-pulse="">
      <section class="panel intro">
        <span>Equation Verifier</span>
        <h1>${escapeHtml(topic.equationTitle)}</h1>
        <p>${escapeHtml(topic.equationSummary)}</p>
      </section>
      <section class="equation-card" id="equation-zone">
        <b>${escapeHtml(topic.formula)}</b>
        <small>${escapeHtml(topic.equationRule)}</small>
        <div class="math-grid">
          <label>lambda<input id="lambda" type="range" min="0" max="100" value="42" /></label>
          <label>权重/复杂度<input id="weight" type="range" min="1" max="100" value="62" /></label>
          <label>基础损失<input id="loss" type="range" min="1" max="100" value="34" /></label>
        </div>
      </section>
      <section class="panel result">
        <span>实时计算</span>
        <strong id="value">0.00</strong>
        <p id="hint">${escapeHtml(topic.equationHint)}</p>
        <button id="verify" type="button">验证当前选择</button>
      </section>
    </main>
    <script>
      const root = document.querySelector('.app');
      const value = document.getElementById('value');
      const hint = document.getElementById('hint');
      const lambda = document.getElementById('lambda');
      const weight = document.getElementById('weight');
      const loss = document.getElementById('loss');
      function render() {
        const l = Number(lambda.value) / 100;
        const w = Number(weight.value) / 10;
        const base = Number(loss.value) / 20;
        const total = base + l * w * w / 8;
        value.textContent = total.toFixed(2);
        root.dataset.state = l > 0.65 && w > 6 ? 'strict' : l < 0.18 && w > 7 ? 'loose' : 'balanced';
        hint.textContent = root.dataset.state === 'loose'
          ? '正则太弱，复杂权重可能放大噪声。'
          : root.dataset.state === 'strict'
            ? '正则很强，模型可能欠拟合。'
            : '${escapeJs(topic.equationHint)}';
      }
      [lambda, weight, loss].forEach((input) => input.addEventListener('input', render));
      document.getElementById('verify').addEventListener('click', render);
      window.addEventListener('message', (event) => {
        const data = event.data || {};
        if (data.type === 'widget:setState' || data.type === 'widget:annotation') {
          root.dataset.pulse = data.pulse || 'equation';
          setTimeout(() => { root.dataset.pulse = ''; }, 2200);
        }
      });
      render();
    </script>
  `);
}

function htmlDocument(body: string) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<style>
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Inter, "Noto Sans SC", system-ui, sans-serif; background: #f8fafc; color: #111827; }
  .app { width: 1280px; height: 720px; display: grid; grid-template-columns: 310px 1fr 300px; gap: 18px; padding: 26px; background: radial-gradient(circle at 20% 10%, #ecfeff, transparent 30%), #f8fafc; overflow: hidden; }
  .panel, .equation-card, .playfield { border: 1px solid #dbe7ef; border-radius: 18px; background: rgba(255,255,255,.92); box-shadow: 0 16px 44px rgba(15,23,42,.08); }
  .panel { padding: 22px; }
  .panel span { display: inline-flex; color: #0f766e; font-weight: 800; font-size: 13px; margin-bottom: 12px; }
  h1 { margin: 0 0 12px; font-size: 34px; line-height: 1.12; }
  p { margin: 0; color: #4b5563; line-height: 1.7; font-size: 17px; }
  .playfield { position: relative; padding: 28px; display: grid; align-content: center; gap: 28px; overflow: hidden; }
  .target { height: 190px; border-radius: 28px; display: grid; place-items: center; background: linear-gradient(135deg, #0f766e, #1d4ed8); color: white; }
  .target strong { font-size: 68px; line-height: 1; }
  .target small { opacity: .86; font-size: 15px; }
  .track { position: relative; height: 180px; border-radius: 22px; background: linear-gradient(#fff, #eef6ff); border: 1px solid #dbeafe; overflow: hidden; }
  .track i { position: absolute; left: 6%; right: 6%; height: 5px; border-radius: 999px; transform-origin: left center; }
  #trainLine { top: 42%; background: #2563eb; transform: rotate(-10deg); }
  #validLine { top: 58%; background: #f97316; transform: rotate(8deg); }
  #marker { position: absolute; top: 24px; bottom: 24px; width: 4px; border-radius: 999px; background: #111827; box-shadow: 0 0 0 9px rgba(17,24,39,.08); transition: left .22s ease; }
  .tokens { display: flex; gap: 12px; flex-wrap: wrap; }
  button { border: 0; border-radius: 12px; padding: 12px 16px; background: #0f766e; color: white; font-weight: 800; cursor: pointer; }
  .tokens button { background: #e0f2fe; color: #075985; }
  label { display: grid; gap: 10px; color: #334155; font-size: 14px; font-weight: 800; margin-bottom: 18px; }
  input[type=range] { width: 100%; accent-color: #0f766e; }
  .equation-card { padding: 30px; display: grid; align-content: center; gap: 28px; }
  .equation-card b { display: block; font-size: 46px; text-align: center; color: #0f172a; }
  .equation-card small { display: block; text-align: center; color: #64748b; font-size: 16px; }
  .math-grid { display: grid; gap: 14px; }
  .result strong { display: block; font-size: 72px; margin: 12px 0; color: #0f766e; }
  .app[data-state=win] .target, .app[data-state=balanced] .result strong { background: #10b981; color: white; border-radius: 22px; padding: 12px; }
  .app[data-state=risk] .target, .app[data-state=loose] .result strong { background: #fef3c7; color: #92400e; border-radius: 22px; padding: 12px; }
  .app[data-pulse] #target-zone, .app[data-pulse] #control-zone, .app[data-pulse] #equation-zone { animation: pulse 1s ease-in-out infinite alternate; }
  @keyframes pulse { from { box-shadow: 0 0 0 0 rgba(20,184,166,.28); } to { box-shadow: 0 0 0 14px rgba(20,184,166,.05); } }
</style>
</head>
<body>${body}</body>
</html>`;
}

function compact(text: string, maxLength: number) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return "资料已上传，等待解析正文。";
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized;
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "_").replace(/^_+|_+$/g, "");
}

function isClassroomElementId(value: string): value is AIClassroomElementId {
  return ["source", "concept", "curve", "formula", "code", "summary", "interactive"].includes(value);
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeJs(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$/g, "\\$").replace(/'/g, "\\'");
}
