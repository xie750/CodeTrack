# 核心数据字典 V0.1

## 1. users

|字段|类型|说明|
|---|---|---|
|id|uuid|用户标识|
|display_name|string|显示名称|
|role|enum|STUDENT/TEACHER/ADMIN|
|status|enum|ACTIVE/DISABLED|
|created_at|datetime|创建时间|

## 2. courses

|字段|类型|说明|
|---|---|---|
|id|uuid|课程标识|
|name|string|课程名称|
|description|text|课程说明|
|term|string|学期，可空|
|status|enum|DRAFT/ACTIVE/ARCHIVED|
|owner_teacher_id|uuid|负责教师|

## 3. tasks

|字段|类型|说明|
|---|---|---|
|id|uuid|任务标识|
|course_id|uuid|课程|
|title|string|任务名称|
|description|text|任务说明|
|language|enum|MVP 为 CPP|
|interface_spec|text|函数或程序接口|
|learning_objectives|json|学习目标|
|capability_ids|json|能力点|
|status|enum|DRAFT/OPEN/CLOSED|

## 4. test_cases

|字段|类型|说明|
|---|---|---|
|id|uuid|测试标识|
|task_id|uuid|所属任务|
|name|string|测试名称|
|visibility|enum|PUBLIC/HIDDEN|
|input_data|text|测试输入或受控引用|
|expected_output|text|期望输出|
|error_tag|string|对应错误标签|
|capability_id|uuid|对应能力点|
|required|bool|是否必须通过|

## 5. submissions

|字段|类型|说明|
|---|---|---|
|id|uuid|提交聚合标识|
|student_id|uuid|学生|
|task_id|uuid|任务|
|status|enum|当前总体状态|
|latest_version_no|int|最新版本号|
|first_submitted_at|datetime|首次提交|
|last_submitted_at|datetime|最近提交|
|passed_at|datetime|通过时间，可空|

唯一约束建议：student_id + task_id。

## 6. submission_versions

|字段|类型|说明|
|---|---|---|
|id|uuid|版本标识|
|submission_id|uuid|所属提交|
|version_no|int|版本号|
|language|enum|CPP|
|source_code|text|代码正文|
|code_hash|string|重复检测和幂等|
|viewed_reference_answer|bool|是否查看参考答案|
|created_at|datetime|创建时间|

唯一约束：submission_id + version_no。

## 7. execution_runs

|字段|类型|说明|
|---|---|---|
|id|uuid|执行标识|
|submission_version_id|uuid|版本|
|status|enum|执行状态|
|compile_exit_code|int|编译退出码|
|compiler_stdout|text|截断后输出|
|compiler_stderr|text|截断后错误|
|resource_usage|json|资源使用|
|started_at|datetime|开始|
|finished_at|datetime|结束|
|failure_reason|string|异常原因|
|idempotency_key|string|幂等键|

## 8. test_results

|字段|类型|说明|
|---|---|---|
|id|uuid|结果标识|
|execution_run_id|uuid|执行|
|test_case_id|uuid|测试|
|status|enum|PASSED/FAILED/TIMEOUT/ERROR|
|actual_output|text|学生可见内容需脱敏|
|expected_output_summary|text|隐藏测试只给摘要|
|duration_ms|int|耗时|
|error_message|text|错误|

## 9. diagnoses

|字段|类型|说明|
|---|---|---|
|id|uuid|诊断标识|
|submission_version_id|uuid|版本|
|status|enum|READY/ERROR/REVIEW_REQUIRED 等|
|diagnosis_type|string|受控错误类型|
|confidence|decimal|0-1|
|explanation|text|解释|
|needs_teacher_review|bool|是否复核|
|model_provider|string|供应商|
|model_name|string|模型|
|prompt_version|string|提示词版本|
|created_at|datetime|时间|

## 10. hint_records

|字段|类型|说明|
|---|---|---|
|id|uuid|提示标识|
|diagnosis_id|uuid|诊断|
|level|int|1-3，参考答案单独类型|
|content|text|提示内容|
|status|enum|GENERATED/VIEWED/REJECTED|
|leakage_check|json|泄露检查|
|student_requested|bool|是否主动申请|
|generated_at|datetime|生成时间|
|viewed_at|datetime|查看时间|

## 11. capability_evidence

|字段|类型|说明|
|---|---|---|
|id|uuid|证据标识|
|student_id|uuid|学生|
|capability_id|uuid|能力|
|task_id|uuid|任务|
|submission_version_id|uuid|来源版本|
|evidence_type|enum|独立通过/提示后通过/重复错误等|
|strength|enum|STRONG/MODERATE/WEAK/NEUTRAL/NEGATIVE|
|explanation|text|可追溯解释|
|teacher_confirmed|bool|教师确认|
|created_at|datetime|时间|

## 12. capability_states

|字段|类型|说明|
|---|---|---|
|student_id|uuid|学生|
|capability_id|uuid|能力|
|state|enum|OBSERVING/NEEDS_SUPPORT/EMERGING/MASTERED|
|reason_summary|text|状态原因|
|updated_at|datetime|更新时间|

唯一约束：student_id + capability_id。
