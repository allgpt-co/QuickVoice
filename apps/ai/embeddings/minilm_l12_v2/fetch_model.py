#!/usr/bin/env python3
"""Build a checksum-pinned all-MiniLM-L12-v2 artifact for QuickVoice TEI."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import time
import urllib.error
import urllib.parse
import urllib.request

MODEL_ID = "sentence-transformers/all-MiniLM-L12-v2"
MODEL_REVISION = "a50ef00143b4d5391434df20ae11632588ac25be"
SOURCE_MAX_SEQ_LENGTH = 128
RUNTIME_MAX_SEQ_LENGTH = 256
MODEL_FILES = {
    "1_Pooling/config.json": "4be450dde3b0273bb9787637cfbd28fe04a7ba6ab9d36ac48e92b11e350ffc23",
    "config.json": "bc451f333af67312ba0de5018ef1c9ba663cb18549443e568f0bd35262dc1c48",
    "config_sentence_transformers.json": "061ca9d39661d6c6d6de5ba27f79a1cd5770ea247f8d46412a68a498dc5ac9f3",
    "model.safetensors": "d2d541e5f101695ae495eacd867a8d025ecfe8f9674fb23aa6cf93cdb60a5542",
    "modules.json": "84e40c8e006c9b1d6c122e02cba9b02458120b5fb0c87b746c41e0207cf642cf",
    "sentence_bert_config.json": "70f4448f31320443fe3557cacea5abf2dcc4915dda8c80646bec9f3bb0aa5a1f",
    "special_tokens_map.json": "303df45a03609e4ead04bc3dc1536d0ab19b5358db685b6f3da123d05ec200e3",
    "tokenizer.json": "be50c3628f2bf5bb5e3a7f17b1f74611b2561a3a27eeab05e5aa30f411572037",
    "tokenizer_config.json": "fba7637034542f691ef4b1ad735d664971e8d9723012a1973d4ee985742e8e72",
    "vocab.txt": "07eced375cec144d27c900241f3e339478dec958f92fddbc551f295c992038a3",
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def verify_file(path: Path, expected_sha256: str) -> None:
    actual = sha256(path)
    if actual != expected_sha256:
        raise RuntimeError(
            f"Checksum mismatch for {path.name}: expected {expected_sha256}, got {actual}"
        )


def download_file(relative_path: str, expected_sha256: str, output_dir: Path) -> None:
    destination = output_dir / relative_path
    destination.parent.mkdir(parents=True, exist_ok=True)
    encoded_path = urllib.parse.quote(relative_path, safe="/")
    url = (
        f"https://huggingface.co/{MODEL_ID}/resolve/"
        f"{MODEL_REVISION}/{encoded_path}"
    )

    for attempt in range(1, 4):
        temporary = destination.with_name(destination.name + ".part")
        try:
            request = urllib.request.Request(
                url,
                headers={"User-Agent": "QuickVoice-MiniLM-artifact-builder/1.0"},
            )
            with urllib.request.urlopen(request, timeout=180) as response, temporary.open("wb") as handle:
                while chunk := response.read(1024 * 1024):
                    handle.write(chunk)
            verify_file(temporary, expected_sha256)
            temporary.replace(destination)
            return
        except (OSError, urllib.error.URLError, RuntimeError):
            temporary.unlink(missing_ok=True)
            if attempt == 3:
                raise
            time.sleep(attempt * 2)


def configure_runtime(model_dir: Path) -> None:
    sentence_config_path = model_dir / "sentence_bert_config.json"
    transformer_config_path = model_dir / "config.json"
    sentence_config = json.loads(sentence_config_path.read_text(encoding="utf-8"))
    transformer_config = json.loads(transformer_config_path.read_text(encoding="utf-8"))

    source_limit = sentence_config.get("max_seq_length")
    if source_limit != SOURCE_MAX_SEQ_LENGTH:
        raise RuntimeError(
            "Refusing to derive model artifact: expected upstream max_seq_length "
            f"{SOURCE_MAX_SEQ_LENGTH}, got {source_limit!r}"
        )

    model_capacity = transformer_config.get("max_position_embeddings")
    if not isinstance(model_capacity, int) or RUNTIME_MAX_SEQ_LENGTH > model_capacity:
        raise RuntimeError(
            f"Requested runtime limit {RUNTIME_MAX_SEQ_LENGTH} exceeds model capacity "
            f"{model_capacity!r}"
        )

    sentence_config["max_seq_length"] = RUNTIME_MAX_SEQ_LENGTH
    sentence_config_path.write_text(
        json.dumps(sentence_config, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )

    provenance = {
        "model_id": MODEL_ID,
        "revision": MODEL_REVISION,
        "source_files": MODEL_FILES,
        "source_max_seq_length": SOURCE_MAX_SEQ_LENGTH,
        "runtime_max_seq_length": RUNTIME_MAX_SEQ_LENGTH,
        "derived_sentence_bert_config_sha256": sha256(sentence_config_path),
    }
    (model_dir / "quickvoice-model-manifest.json").write_text(
        json.dumps(provenance, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


def build_model_artifact(output_dir: Path) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    for relative_path, expected_sha256 in MODEL_FILES.items():
        download_file(relative_path, expected_sha256, output_dir)
    configure_runtime(output_dir)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    build_model_artifact(args.output)
