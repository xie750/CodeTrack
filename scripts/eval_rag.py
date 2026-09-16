"""Isolated retrieval evaluation, never opens the application's database.

python -m scripts.eval_rag --mode lexical --output artifacts/rag/lexical.json
python -m scripts.eval_rag --mode semantic --output artifacts/rag/semantic.json
python -m scripts.eval_rag --mode baseline --baseline-ref HEAD --output artifacts/rag/baseline.json
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--mode", choices=["baseline", "lexical", "semantic"], default="lexical")
    parser.add_argument("--baseline-ref", default="HEAD")
    parser.add_argument("--fixture", type=Path, default=Path("tests/fixtures/rag_eval.json"))
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    os.environ["CODETRACK_DATABASE_URL"] = "sqlite:///:memory:"
    os.environ["CODETRACK_EMBEDDING_PROVIDER"] = "bge_m3" if args.mode == "semantic" else "hash"
    os.environ["CODETRACK_EMBEDDING_MODEL"] = "BAAI/bge-m3"
    os.environ["CODETRACK_RERANK_PROVIDER"] = "bge" if args.mode == "semantic" else "lexical"
    os.environ["CODETRACK_MIN_RERANK_SCORE"] = "0.15" if args.mode == "semantic" else "0"
    os.environ.setdefault("OMP_NUM_THREADS", "4")
    os.environ.setdefault("MKL_NUM_THREADS", "4")
    baseline_dir = tempfile.TemporaryDirectory() if args.mode == "baseline" else None
    if baseline_dir:
        # Execute the actual pre-change algorithms in this isolated evaluation process.
        import backend.app.services.rag
        for name in ("utils", "parsers", "profiles", "embeddings", "rerankers", "chunking", "retrieval"):
            source = subprocess.check_output(["git", "show", f"{args.baseline_ref}:backend/app/services/rag/{name}.py"])
            path = Path(baseline_dir.name) / f"{name}.py"
            path.write_bytes(source)
            module_name = f"backend.app.services.rag.{name}"
            spec = importlib.util.spec_from_file_location(module_name, path)
            module = importlib.util.module_from_spec(spec)
            sys.modules[module_name] = module
            spec.loader.exec_module(module)

    from sqlalchemy import create_engine
    from sqlalchemy.orm import Session
    from backend.app.core.config import get_settings
    from backend.app.models import Base, RagChunk, RagDocument, RagDocumentVersion, RagKnowledgeBase, User
    from backend.app.services.rag.chunking import build_parent_child_chunks
    from backend.app.services.rag.embeddings import get_embedding_provider
    from backend.app.services.rag.parsers import parse_document
    from backend.app.services.rag.profiles import detect_content_profile
    from backend.app.services.rag.retrieval import retrieve_chunks
    from backend.app.services.rag.utils import json_dumps, sha256_text, vector_to_db

    get_settings.cache_clear()
    data = json.loads(args.fixture.read_text(encoding="utf-8"))
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    settings = get_settings()
    provider = get_embedding_provider()
    with Session(engine) as db:
        db.add(User(id="eval-user", display_name="Evaluation", role="STUDENT"))
        db.add(RagKnowledgeBase(id="eval-kb", owner_id="eval-user", name="Evaluation",
            embedding_provider=settings.embedding_provider, embedding_model=provider.model_name,
            embedding_dim=1024, retrieval_config="{}", status="active"))
        for doc in data["documents"]:
            version_id = doc["id"] + "-v1"
            db.add(RagDocument(id=doc["id"], knowledge_base_id="eval-kb", owner_id="eval-user", name=doc["name"],
                status="READY", active_version_id=version_id, sha256=sha256_text(doc["content"]), object_key="evaluation"))
            db.add(RagDocumentVersion(id=version_id, document_id=doc["id"], version_no=1, object_key="evaluation",
                sha256=sha256_text(doc["content"]), embedding_model=provider.model_name, embedding_dim=1024, status="READY"))
            parsed = parse_document(doc["name"], doc["content"].encode())
            groups = build_parent_child_chunks(parsed.elements, detect_content_profile(doc["name"], parsed.elements))
            for parent, children in groups:
                parent_id = f'{doc["id"]}-p{parent.chunk_index}'
                for chunk in [parent, *children]:
                    child = chunk.chunk_type == "child"
                    chunk_id = f"{parent_id}-c{chunk.chunk_index}" if child else parent_id
                    indexed = chunk.content
                    if child and args.mode != "baseline":
                        from backend.app.services.rag.utils import retrieval_text
                        indexed = retrieval_text(doc["name"], chunk.heading_path, chunk.content)
                    vector = provider.embed([indexed])[0] if child else None
                    db.add(RagChunk(id=chunk_id, knowledge_base_id="eval-kb", document_id=doc["id"],
                        document_version_id=version_id, parent_chunk_id=parent_id if child else None,
                        chunk_type=chunk.chunk_type, chunk_index=parent.chunk_index * 10000 + chunk.chunk_index,
                        content=chunk.content, content_hash=sha256_text(chunk.content),
                        heading=chunk.heading, heading_path=json_dumps(chunk.heading_path), content_type=chunk.content_type,
                        token_count=chunk.token_count, char_count=len(chunk.content),
                        embedding=vector_to_db(vector) if vector else None, enabled=True))
        db.commit()
        results = []
        for case in data["queries"]:
            start = time.perf_counter()
            found = retrieve_chunks(db, "eval-kb", case["query"])
            ids = list(dict.fromkeys(item.document_id for item in found))
            relevant = set(case["relevant"])
            rank = next((i + 1 for i, item in enumerate(ids) if item in relevant), None)
            results.append({**case, "returned": ids, "rank": rank, "seconds": round(time.perf_counter() - start, 3)})
    answerable = [item for item in results if item["relevant"]]
    negative = [item for item in results if not item["relevant"]]
    baseline_commit = subprocess.check_output(["git", "rev-parse", args.baseline_ref], text=True).strip() if baseline_dir else None
    report = {"mode": args.mode, "baseline_ref": baseline_commit,
        "fixture": str(args.fixture), "query_count": len(results),
        "metrics": {
            "hit_at_1": sum(item["rank"] == 1 for item in answerable) / len(answerable),
            "hit_at_3": sum(item["rank"] is not None and item["rank"] <= 3 for item in answerable) / len(answerable),
            "mrr_at_6": sum(1 / item["rank"] if item["rank"] else 0 for item in answerable) / len(answerable),
            "no_answer_accuracy": sum(not item["returned"] for item in negative) / max(1, len(negative))},
        "results": results}
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({key: value for key, value in report.items() if key != "results"}, ensure_ascii=False, indent=2))
    if baseline_dir:
        baseline_dir.cleanup()


if __name__ == "__main__":
    main()
