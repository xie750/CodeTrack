# 单链表删除任务开发夹具

**状态：首个 Demo 开发基线**

本文档定义 F003 沙箱执行和测试结果所需的最小判题协议。这里的测试数据是开发判题夹具，不是发布验收报告。

## 1. 固定任务协议

学生只实现指定函数，不编写 `main`。

```cpp
ListNode* deleteAt(ListNode* head, int position);
```

平台提供节点结构：

```cpp
struct ListNode {
    int val;
    ListNode* next;
    ListNode(int x) : val(x), next(nullptr) {}
};
```

语义规则：

- `head == nullptr` 时返回 `nullptr`；
- `position < 0` 时返回原链表头指针；
- `position >= 链表长度` 时返回原链表头指针；
- `position == 0` 时返回原头节点的下一个节点；
- 删除中间或尾节点时，返回原链表头指针；
- 首个 Demo 不要求学生释放被删除节点；
- 测试驱动负责构造链表、比较返回链表和清理可达节点；
- 学生代码不得依赖标准输入输出；
- 学生代码不得自定义 `main`；
- 代码大小上限：20KB。

允许学生使用：

- 基础 C++ 语法；
- 局部变量、循环、条件判断；
- 辅助函数；
- `nullptr`。

不允许学生依赖：

- 网络、文件系统、系统命令；
- 随机数；
- 交互式输入；
- 自定义进程或线程。

## 2. 学生初始代码模板

```cpp
ListNode* deleteAt(ListNode* head, int position) {
    // 在这里实现删除指定位置节点的逻辑
    return head;
}
```

## 3. 标准错误代码

用于首个 Demo 的预置错误代码。它能删除中间节点，但删除头节点时没有更新头指针。

```cpp
ListNode* deleteAt(ListNode* head, int position) {
    if (head == nullptr || position < 0) {
        return head;
    }

    ListNode* prev = nullptr;
    ListNode* cur = head;
    int index = 0;

    while (cur != nullptr && index < position) {
        prev = cur;
        cur = cur->next;
        index++;
    }

    if (cur == nullptr) {
        return head;
    }

    if (prev != nullptr) {
        prev->next = cur->next;
    }

    return head;
}
```

预期：

- `tc_delete_middle` 删除中间节点：通过；
- `tc_delete_head` 删除头节点：失败；
- `tc_delete_empty` 空链表：通过；
- `tc_delete_tail` 删除尾节点：通过；
- `tc_invalid_position` 非法位置：通过。

## 4. 标准正确代码

```cpp
ListNode* deleteAt(ListNode* head, int position) {
    if (head == nullptr || position < 0) {
        return head;
    }

    if (position == 0) {
        return head->next;
    }

    ListNode* prev = head;
    int index = 0;

    while (prev != nullptr && index < position - 1) {
        prev = prev->next;
        index++;
    }

    if (prev == nullptr || prev->next == nullptr) {
        return head;
    }

    prev->next = prev->next->next;
    return head;
}
```

预期：通过全部必要测试。

## 5. 最小测试数据

|顺序|测试 ID|名称|可见性|输入链表|position|期望链表|required|error_tag|capability_id|
|---|---|---|---|---|---:|---|---|---|---|
|TC01|tc_delete_middle|删除中间节点|PUBLIC|`[1,2,3]`|1|`[1,3]`|true|NORMAL_DELETE|cap_linked_list_boundary|
|TC02|tc_delete_head|删除头节点|PUBLIC|`[1,2,3]`|0|`[2,3]`|true|LINKED_LIST_HEAD_UPDATE_ERROR|cap_linked_list_boundary|
|TC03|tc_delete_empty|空链表删除|PUBLIC|`[]`|0|`[]`|true|EMPTY_LIST_GUARD|cap_linked_list_boundary|
|TC04|tc_delete_tail|删除尾节点|HIDDEN|`[1,2,3]`|2|`[1,2]`|true|TAIL_DELETE|cap_linked_list_boundary|
|TC05|tc_invalid_position|非法位置|HIDDEN|`[1,2]`|5|`[1,2]`|true|INVALID_POSITION|cap_linked_list_boundary|

隐藏测试对学生只展示摘要：

- `tc_delete_tail`：边界位置删除结果不正确；
- `tc_invalid_position`：非法位置处理结果不正确。

## 6. 编译命令模板

沙箱服务使用受控模板编译，不允许前端或学生提交任意编译命令。

```bash
g++ -std=c++17 -O2 -pipe -static -s main.cpp -o main
```

如果目标环境不支持静态链接，可退化为：

```bash
g++ -std=c++17 -O2 -pipe main.cpp -o main
```

## 7. 测试驱动要求

测试驱动负责：

- 注入 `ListNode` 定义；
- 拼接学生函数实现；
- 构造输入链表；
- 调用 `deleteAt(head, position)`；
- 将返回链表转换为数组；
- 与期望数组比较；
- 对每个测试返回结构化结果；
- 限制输出长度；
- 清理返回链表中的可达节点。

结构化结果至少包含：

```json
{
  "test_case_id": "tc_delete_head",
  "name": "删除头节点",
  "status": "FAILED",
  "visibility": "PUBLIC",
  "expected_output_summary": "[2,3]",
  "actual_output": "[1,2,3]",
  "duration_ms": 3,
  "error_tag": "LINKED_LIST_HEAD_UPDATE_ERROR"
}
```

## 8. 异常样例

编译失败样例：

```cpp
ListNode* deleteAt(ListNode* head, int position) {
    return head
}
```

超时样例：

```cpp
ListNode* deleteAt(ListNode* head, int position) {
    while (true) {}
    return head;
}
```

运行错误样例：

```cpp
ListNode* deleteAt(ListNode* head, int position) {
    ListNode* p = nullptr;
    p->next = head;
    return head;
}
```

## 9. AI 评测参考

### 必须提及

- 失败集中在删除第一个节点；
- 需要检查链表起点或头指针更新。

### 一级提示禁止

- 直接给出完整 `head = head->next` 修复上下文；
- 输出完整正确函数；
- 复制标准答案。

### 允许引用

- 课程实验指导中的头节点删除规则；
- 链表删除章节；
- 教师审核的边界错误案例。
