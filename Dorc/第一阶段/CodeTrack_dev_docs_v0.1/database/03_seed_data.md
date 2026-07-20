# Demo V0.1 种子数据

**状态：首个 Demo 开发基线**

本文档定义本地开发和首个 Demo 需要预置的数据。ID 使用可读稳定 ID，实际落库可以映射为 UUID，但接口响应应保持字符串 ID，不暴露数据库自增主键。

## 1. 用户

|id|display_name|role|status|说明|
|---|---|---|---|---|
|user_teacher_001|王老师|TEACHER|ACTIVE|首个 Demo 教师账号|
|user_student_001|学生一|STUDENT|ACTIVE|标准演示学生账号|
|user_student_002|学生二|STUDENT|ACTIVE|可选对照学生账号|

登录方式：

- 使用简单用户名和密码；
- 演示账号密码可在本地 `.env.example` 或 seed 说明中配置；
- 不在文档中记录真实线上密码。

## 2. 课程

|id|name|description|term|status|owner_teacher_id|
|---|---|---|---|---|---|
|course_ds_001|数据结构|面向链表、树和排序等基础数据结构的实验课程|2026-demo|ACTIVE|user_teacher_001|

## 3. 课程成员

|course_id|user_id|role|
|---|---|---|
|course_ds_001|user_teacher_001|TEACHER|
|course_ds_001|user_student_001|STUDENT|
|course_ds_001|user_student_002|STUDENT|

## 4. 能力点

|id|code|name|description|
|---|---|---|---|
|cap_linked_list_boundary|LINKED_LIST_BOUNDARY_HANDLING|链表边界处理|能够处理链表删除中的头节点、空链表、尾节点和非法位置等边界情况|

## 5. 任务

|id|course_id|title|language|status|capability_ids|
|---|---|---|---|---|---|
|task_linked_list_delete_001|course_ds_001|单链表指定位置节点删除|CPP|OPEN|`["cap_linked_list_boundary"]`|

任务接口：

```cpp
ListNode* deleteAt(ListNode* head, int position);
```

学习目标：

- 理解单链表删除操作；
- 处理空链表；
- 处理删除头节点；
- 正确维护前驱节点和后继节点；
- 通过测试验证边界情况。

## 6. 测试用例

|id|task_id|name|visibility|required|error_tag|capability_id|
|---|---|---|---|---|---|---|
|tc_delete_middle|task_linked_list_delete_001|删除中间节点|PUBLIC|true|NORMAL_DELETE|cap_linked_list_boundary|
|tc_delete_head|task_linked_list_delete_001|删除头节点|PUBLIC|true|LINKED_LIST_HEAD_UPDATE_ERROR|cap_linked_list_boundary|
|tc_delete_empty|task_linked_list_delete_001|空链表删除|PUBLIC|true|EMPTY_LIST_GUARD|cap_linked_list_boundary|
|tc_delete_tail|task_linked_list_delete_001|删除尾节点|HIDDEN|true|TAIL_DELETE|cap_linked_list_boundary|
|tc_invalid_position|task_linked_list_delete_001|非法位置|HIDDEN|true|INVALID_POSITION|cap_linked_list_boundary|

测试输入和期望输出以判题夹具为准：`testing/02_linked_list_test_cases.md`。

## 7. 知识来源

|source_id|title|source_type|version|authority_level|student_visible|
|---|---|---|---|---|---|
|kb_linked_list_delete_basic|单链表删除基本规则|TEACHER_NOTE|v0.1|HIGH|true|
|kb_head_node_delete|删除头节点时的链表起点更新|TEACHER_NOTE|v0.1|HIGH|true|
|kb_empty_list_guard|空链表与非法位置保护|TEACHER_NOTE|v0.1|HIGH|true|
|kb_boundary_test_reasoning|用边界测试验证链表删除|TEACHER_NOTE|v0.1|MEDIUM|true|

最小正文摘要：

- `kb_linked_list_delete_basic`：删除链表节点时，需要找到目标节点并维护相邻节点之间的连接关系。
- `kb_head_node_delete`：删除第一个节点时，没有前驱节点，需要更新代表链表起点的头指针或返回新的头节点。
- `kb_empty_list_guard`：空链表、负数位置和超过长度的位置都应先判断，避免空指针访问或错误修改。
- `kb_boundary_test_reasoning`：链表删除不能只测试中间节点，还应覆盖头节点、尾节点、空链表和非法位置。

## 8. 标准代码资产

|id|task_id|type|说明|
|---|---|---|---|
|code_wrong_head_update|task_linked_list_delete_001|STANDARD_WRONG|删除头节点后未更新头指针|
|code_correct_delete_at|task_linked_list_delete_001|STANDARD_CORRECT|符合首个 Demo 协议的参考实现|

代码正文以判题夹具为准：`testing/02_linked_list_test_cases.md`。

## 9. 初始化要求

- 首次启动本地开发环境时可通过 seed 脚本写入以上数据；
- 重复执行 seed 脚本必须幂等；
- 如果记录已存在，按稳定 ID 更新非历史型配置数据；
- 不覆盖学生真实提交、执行记录、诊断、提示和能力证据；
- seed 数据不得包含真实密钥。
