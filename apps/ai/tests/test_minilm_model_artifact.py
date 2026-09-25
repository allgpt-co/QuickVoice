import importlib.util
import json
from pathlib import Path
import tempfile
import unittest


SCRIPT = Path(__file__).resolve().parents[1] / "embeddings" / "minilm_l12_v2" / "fetch_model.py"
DOCKERFILE = SCRIPT.with_name("Dockerfile")
SPEC = importlib.util.spec_from_file_location("minilm_model_artifact", SCRIPT)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError("Unable to load the MiniLM model artifact builder")
model_artifact = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(model_artifact)


class MiniLmModelArtifactTests(unittest.TestCase):
    def test_dockerfile_pins_tei_and_runs_fail_closed_as_non_root(self):
        dockerfile = DOCKERFILE.read_text(encoding="utf-8")

        self.assertIn(
            "python:3.12.14-slim-bookworm@sha256:392307d22300de8b5986851a12d9176dfc0fc073e65bf6523ebd7dcbeb23564e",
            dockerfile,
        )
        self.assertIn(
            "ghcr.io/huggingface/text-embeddings-inference:cpu-1.9.4@sha256:2538ea1c9640d3763b15af668039d24172d063b42337b0c27796fc2be180c78d",
            dockerfile,
        )
        self.assertIn("USER 1000:1000", dockerfile)
        self.assertIn('"--model-id", "/models/all-MiniLM-L12-v2"', dockerfile)
        self.assertIn('"--served-model-name", "all-MiniLM-L12-v2"', dockerfile)
        self.assertIn('"--auto-truncate=false"', dockerfile)
        self.assertIn('"--max-client-batch-size", "32"', dockerfile)
        self.assertIn('"--max-batch-tokens", "4096"', dockerfile)
        self.assertNotIn(":latest", dockerfile)

    def test_manifest_pins_model_revision_and_weight_checksum(self):
        self.assertEqual(
            model_artifact.MODEL_REVISION,
            "a50ef00143b4d5391434df20ae11632588ac25be",
        )
        self.assertEqual(
            model_artifact.MODEL_FILES["model.safetensors"],
            "d2d541e5f101695ae495eacd867a8d025ecfe8f9674fb23aa6cf93cdb60a5542",
        )
        self.assertEqual(
            model_artifact.MODEL_FILES["tokenizer.json"],
            "be50c3628f2bf5bb5e3a7f17b1f74611b2561a3a27eeab05e5aa30f411572037",
        )
        self.assertEqual(
            model_artifact.MODEL_FILES["config_sentence_transformers.json"],
            "061ca9d39661d6c6d6de5ba27f79a1cd5770ea247f8d46412a68a498dc5ac9f3",
        )

    def test_configure_runtime_changes_only_expected_token_limit_and_records_provenance(self):
        with tempfile.TemporaryDirectory() as directory:
            model_dir = Path(directory)
            original = {"max_seq_length": 128, "do_lower_case": True}
            config_path = model_dir / "sentence_bert_config.json"
            config_path.write_text(json.dumps(original), encoding="utf-8")
            (model_dir / "config.json").write_text(
                json.dumps({"max_position_embeddings": 512}),
                encoding="utf-8",
            )

            model_artifact.configure_runtime(model_dir)

            configured = json.loads(config_path.read_text(encoding="utf-8"))
            self.assertEqual(configured, {"max_seq_length": 256, "do_lower_case": True})
            provenance = json.loads(
                (model_dir / "quickvoice-model-manifest.json").read_text(encoding="utf-8")
            )
            self.assertEqual(provenance["model_id"], "sentence-transformers/all-MiniLM-L12-v2")
            self.assertEqual(provenance["revision"], model_artifact.MODEL_REVISION)
            self.assertEqual(provenance["source_max_seq_length"], 128)
            self.assertEqual(provenance["runtime_max_seq_length"], 256)
            self.assertEqual(provenance["source_files"], model_artifact.MODEL_FILES)
            self.assertEqual(len(provenance["derived_sentence_bert_config_sha256"]), 64)

    def test_configure_runtime_fails_closed_on_upstream_limit_drift(self):
        with tempfile.TemporaryDirectory() as directory:
            model_dir = Path(directory)
            (model_dir / "sentence_bert_config.json").write_text(
                json.dumps({"max_seq_length": 129}),
                encoding="utf-8",
            )
            (model_dir / "config.json").write_text(
                json.dumps({"max_position_embeddings": 512}),
                encoding="utf-8",
            )

            with self.assertRaisesRegex(RuntimeError, "expected upstream max_seq_length 128"):
                model_artifact.configure_runtime(model_dir)

    def test_configure_runtime_rejects_target_beyond_model_capacity(self):
        with tempfile.TemporaryDirectory() as directory:
            model_dir = Path(directory)
            (model_dir / "sentence_bert_config.json").write_text(
                json.dumps({"max_seq_length": 128}),
                encoding="utf-8",
            )
            (model_dir / "config.json").write_text(
                json.dumps({"max_position_embeddings": 128}),
                encoding="utf-8",
            )

            with self.assertRaisesRegex(RuntimeError, "exceeds model capacity"):
                model_artifact.configure_runtime(model_dir)


if __name__ == "__main__":
    unittest.main()
