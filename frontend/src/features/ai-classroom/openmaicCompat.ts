/*
 * OpenMAIC-compatible classroom contract for CodeTrack.
 *
 * The type shape follows the MIT-licensed OpenMAIC DSL idea:
 * Stage -> Scene[] -> Action[].
 * Source: https://github.com/THU-MAIC/OpenMAIC
 */

export type AIClassroomElementId = "source" | "concept" | "curve" | "formula" | "code" | "summary";

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

export type OpenMaicScene = {
  id: string;
  stageId: string;
  title: string;
  order: number;
  type: "slide" | "interactive";
  content: {
    type: "slide" | "interactive";
    title: string;
    summary: string;
    elements: Array<{
      id: AIClassroomElementId;
      label: string;
      kind: "source" | "concept" | "chart" | "formula" | "code" | "question";
      text: string;
    }>;
  };
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
  const textPreview = compact(rawText, 180);
  const topic = inferTopic(fileName, rawText);
  const stageId = `ct_stage_${slug(topic.title)}`;
  const now = Date.now();

  return {
    stage: {
      id: stageId,
      name: `${topic.title} AI讲解课堂`,
      description: `由 ${fileName} 生成的 OpenMAIC 兼容课堂对象。`,
      createdAt: now,
      updatedAt: now,
      style: "codetrack_ai_major_workspace",
      interactiveMode: true
    },
    material: {
      fileName,
      mimeType,
      textPreview,
      parsedBy
    },
    citations: topic.citations,
    scenes: [
      {
        id: `${stageId}_scene_1`,
        stageId,
        title: topic.title,
        order: 1,
        type: "slide",
        content: {
          type: "slide",
          title: topic.title,
          summary: topic.summary,
          elements: [
            { id: "source", label: "资料片段", kind: "source", text: textPreview },
            { id: "concept", label: "核心概念", kind: "concept", text: topic.concept },
            { id: "curve", label: "互动图示", kind: "chart", text: topic.chartText },
            { id: "formula", label: "公式/规则", kind: "formula", text: topic.formula },
            { id: "code", label: "代码落点", kind: "code", text: topic.code },
            { id: "summary", label: "课堂追问", kind: "question", text: topic.question }
          ]
        },
        actions: [
          { id: "a1", type: "speech", title: "读取资料", text: topic.opening, voice: "concept_tutor", speed: 1 },
          { id: "a2", type: "spotlight", title: "聚焦资料片段", elementId: "source", dimOpacity: 0.45 },
          { id: "a3", type: "speech", title: "解释核心概念", text: topic.conceptLine, voice: "concept_tutor", speed: 1 },
          { id: "a4", type: "spotlight", title: "聚焦核心概念", elementId: "concept", dimOpacity: 0.45 },
          { id: "a5", type: "widget_highlight", title: "操作互动图示", target: "#curve", content: topic.chartLine },
          { id: "a6", type: "wb_open", title: "打开白板" },
          { id: "a7", type: "wb_draw_text", title: "写下关键式", content: topic.formulaNote, x: 72, y: 72, width: 500, fontSize: 20, color: "#7d4b08" },
          { id: "a8", type: "spotlight", title: "定位代码落点", elementId: "code", dimOpacity: 0.45 },
          { id: "a9", type: "speech", title: "代码说明", text: topic.codeLine, voice: "concept_tutor", speed: 1 },
          { id: "a10", type: "discussion", title: "暂停追问", topic: topic.question, prompt: topic.questionPrompt, agentId: "concept_tutor" }
        ]
      }
    ]
  };
}

function inferTopic(fileName: string, text: string) {
  const source = `${fileName}\n${text}`;
  if (/链表|linked\s*list|deleteAt|head/i.test(source)) {
    return {
      title: "单链表删除节点",
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
      citations: ["数据结构讲义 / 单链表", "任务工作区 / 删除节点测试", "学习画像 / 边界条件遗漏"]
    };
  }
  if (/stack|queue|栈|队列|括号/i.test(source)) {
    return {
      title: "栈与队列的适用场景",
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
      citations: ["数据结构讲义 / 栈与队列", "课程题库 / 括号匹配", "学习画像 / 数据结构选择混淆"]
    };
  }
  return {
    title: "过拟合与正则化",
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
    citations: ["机器学习讲义 / 第 4 章 模型评估", "课程知识库 / 过拟合与泛化", "Python 实验模板 / Ridge 回归"]
  };
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
  return ["source", "concept", "curve", "formula", "code", "summary"].includes(value);
}
