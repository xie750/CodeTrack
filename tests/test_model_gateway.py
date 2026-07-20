import pytest

from backend.app.services.model_gateway import (
    build_openai_chat_payload,
    parse_openai_chat_response,
    validate_gateway_output,
)


def valid_output() -> dict:
    return {
        "diagnosis_type": "LINKED_LIST_HEAD_UPDATE_ERROR",
        "confidence": 0.86,
        "explanation": "失败集中在删除首节点，返回链表起点与测试证据不一致。",
        "verified_evidence_ids": ["tr_001"],
        "knowledge_source_ids": ["kb_head_node_delete"],
        "hint": "请检查删除第一个节点后，代表链表起点的返回值是否仍指向旧节点。",
        "needs_teacher_review": False,
        "model_provider": "TEST_GATEWAY",
        "model_name": "test-model",
    }


def test_validate_gateway_output_accepts_valid_schema():
    result = validate_gateway_output(
        valid_output(),
        allowed_evidence_ids={"tr_001"},
        allowed_source_ids={"kb_head_node_delete"},
        fallback_model_name="fallback",
    )
    assert result.diagnosis_type == "LINKED_LIST_HEAD_UPDATE_ERROR"
    assert result.confidence == 0.86
    assert result.model_provider == "TEST_GATEWAY"


def test_openai_chat_payload_uses_json_schema_contract():
    chat_payload = build_openai_chat_payload(
        {
            "prompt_version": "diagnosis_v0.1",
            "task": {"title": "delete linked-list node"},
            "output_schema": {"diagnosis_type": ["LINKED_LIST_HEAD_UPDATE_ERROR"]},
        },
        "gpt-test",
    )

    assert chat_payload["model"] == "gpt-test"
    assert chat_payload["response_format"] == {"type": "json_object"}
    assert chat_payload["messages"][0]["role"] == "system"
    assert "Return one JSON object" in chat_payload["messages"][0]["content"]
    assert "diagnosis_v0.1" in chat_payload["messages"][1]["content"]


def test_parse_openai_chat_response_extracts_model_json():
    body = {
        "choices": [
            {
                "message": {
                    "content": (
                        '{"diagnosis_type":"LINKED_LIST_HEAD_UPDATE_ERROR",'
                        '"confidence":0.9,'
                        '"explanation":"Uses real tool evidence.",'
                        '"verified_evidence_ids":["tr_001"],'
                        '"knowledge_source_ids":["kb_head_node_delete"],'
                        '"hint":"Check whether the list start changes after deleting the first node."}'
                    )
                }
            }
        ]
    }

    parsed = parse_openai_chat_response(body)

    assert parsed["diagnosis_type"] == "LINKED_LIST_HEAD_UPDATE_ERROR"
    assert parsed["verified_evidence_ids"] == ["tr_001"]


@pytest.mark.parametrize(
    "mutation",
    [
        lambda data: data.update({"confidence": 1.5}),
        lambda data: data.update({"verified_evidence_ids": ["missing"]}),
        lambda data: data.update({"knowledge_source_ids": ["missing"]}),
        lambda data: data.update({"hint": "return head->next"}),
        lambda data: data.update({"diagnosis_type": "FREE_FORM_ERROR"}),
    ],
)
def test_validate_gateway_output_rejects_invalid_model_content(mutation):
    data = valid_output()
    mutation(data)
    with pytest.raises(ValueError):
        validate_gateway_output(
            data,
            allowed_evidence_ids={"tr_001"},
            allowed_source_ids={"kb_head_node_delete"},
            fallback_model_name="fallback",
        )
