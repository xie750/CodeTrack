"""模型调用的分类异常。

改造前 `model_gateway.request_gateway_diagnosis` 用裸 `except Exception: return None`
吞掉一切失败，超时、限流、JSON 解析失败、schema 校验失败在数据里毫无区别。
这里给每类失败一个稳定的 `code`，`agent_runs.error_code` 存的就是它，
失败率才能按原因聚合。
"""


class LLMError(Exception):
    """所有模型调用失败的基类。"""

    code = "LLM_ERROR"
    retryable = False

    def __init__(self, message: str = "", *, detail: str | None = None) -> None:
        super().__init__(message or self.code)
        self.detail = detail
        # 由 llm_client 的重试循环在放行异常前回填，便于落 agent_runs.attempts
        self.attempts = 1


class LLMNotConfigured(LLMError):
    """既没有配置网关地址，也没有配置模型 API Key。"""

    code = "LLM_NOT_CONFIGURED"


class LLMTimeout(LLMError):
    """请求超时。"""

    code = "LLM_TIMEOUT"
    retryable = True


class LLMHTTPError(LLMError):
    """传输层失败或非 2xx 响应。5xx 与连接失败视为可重试。"""

    code = "LLM_HTTP_ERROR"

    def __init__(self, message: str = "", *, status_code: int | None = None, detail: str | None = None) -> None:
        super().__init__(message, detail=detail)
        self.status_code = status_code
        self.retryable = status_code is None or status_code >= 500


class LLMInvalidJSON(LLMError):
    """响应不是可解析的 JSON，或缺少约定的取值路径。"""

    code = "LLM_INVALID_JSON"
    retryable = True


class LLMSchemaInvalid(LLMError):
    """JSON 能解析，但没通过输出 schema / 护栏校验。

    不可重试：同样的 prompt 大概率再产出同样不合规的内容，
    重试只是把等待时间乘以次数。
    """

    code = "LLM_SCHEMA_INVALID"
