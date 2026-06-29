import contextlib
import importlib.util
import io
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest


REPO_ROOT = Path(__file__).resolve().parents[1]
RUNNER_PATH = REPO_ROOT / "scripts" / "codex_module_testing_guide.py"


def load_runner():
    spec = importlib.util.spec_from_file_location(
        "codex_module_testing_guide", RUNNER_PATH
    )
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class CodexModuleTestingGuideTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = Path(tempfile.mkdtemp())

    def tearDown(self):
        shutil.rmtree(self.temp_dir)

    def complete_guide(self, title="Marketing website and public UX"):
        headings = [f"# {title} Testing Guide", *load_runner().REQUIRED_GUIDE_HEADINGS]
        return "\n\n".join(f"{heading}\n\nContent for {heading}." for heading in headings)

    def result(
        self,
        runner,
        *,
        module="apps-web",
        title="Marketing website and public UX",
        status="completed",
        final_message=None,
    ):
        return runner.ModuleGuideResult(
            module=module,
            title=title,
            status=status,
            returncode=0,
            duration_seconds=1.25,
            final_message=final_message or self.complete_guide(title),
            guide_path=None,
            stdout_path=Path(".testing_guide_runs/run/apps-web.stdout.jsonl"),
            stderr_path=Path(".testing_guide_runs/run/apps-web.stderr.log"),
            changed_files=[],
            missing_headings=[],
        )

    def test_build_codex_command_uses_full_permission_session(self):
        runner = load_runner()
        module = runner.select_modules(["apps-ai"])[0]

        command = runner.build_codex_command(
            repo_root=REPO_ROOT,
            module=module,
            output_last_message=REPO_ROOT
            / ".testing_guide_runs"
            / "run"
            / "apps-ai.final.md",
        )

        self.assertEqual(command[:2], ["codex", "exec"])
        self.assertIn("--model", command)
        self.assertEqual(command[command.index("--model") + 1], "codex2")
        self.assertIn("--dangerously-bypass-approvals-and-sandbox", command)
        self.assertIn("--ephemeral", command)
        self.assertIn("--json", command)
        self.assertIn("--cd", command)
        self.assertIn(str(REPO_ROOT), command)
        self.assertIn("--output-last-message", command)

    def test_build_codex_command_allows_model_override(self):
        runner = load_runner()
        module = runner.select_modules(["apps-ai"])[0]

        command = runner.build_codex_command(
            repo_root=REPO_ROOT,
            module=module,
            output_last_message=REPO_ROOT
            / ".testing_guide_runs"
            / "run"
            / "apps-ai.final.md",
            model="codex-custom",
        )

        self.assertEqual(command[command.index("--model") + 1], "codex-custom")

    def test_build_prompt_contains_intern_testing_scope_rules_and_headings(self):
        runner = load_runner()
        module = runner.select_modules(["apps-console"])[0]

        prompt = runner.build_testing_guide_prompt(module, git_sha="abc123")

        self.assertIn("apps-console", prompt)
        self.assertIn("apps/console", prompt)
        self.assertIn("Do not edit", prompt)
        self.assertIn("Do not create", prompt)
        self.assertIn("intern", prompt.lower())
        self.assertIn("SaaS", prompt)
        self.assertIn("Architecture And Data Flow Testing", prompt)
        self.assertIn("Functional Test Cases", prompt)
        self.assertIn("Non-Functional Test Cases", prompt)
        self.assertIn("Integration And API Test Cases", prompt)
        self.assertIn("UX, UI, Accessibility, And Compatibility Testing", prompt)
        self.assertIn("SaaS Business And Operations Test Cases", prompt)
        self.assertIn("Security, Privacy, And Compliance Checks", prompt)
        self.assertIn("pass/fail", prompt)
        self.assertIn("Release Acceptance Checklist", prompt)
        self.assertIn("sequential guide run", prompt)
        self.assertIn("abc123", prompt)

    def test_missing_required_headings_reports_exact_gaps(self):
        runner = load_runner()
        module = runner.select_modules(["apps-web"])[0]

        missing = runner.missing_required_headings(module, "## Module Overview\n")

        self.assertIn("# Marketing website and public UX Testing Guide", missing)
        self.assertIn("## Intern Testing Orientation", missing)
        self.assertIn("## Setup And Required Services", missing)
        self.assertNotIn("## Module Overview", missing)

    def test_dry_run_prints_selected_modules_and_output_paths(self):
        runner = load_runner()
        output_dir = self.temp_dir / "testing-guides"
        run_dir = self.temp_dir / ".testing_guide_runs" / "dry-run"

        buffer = io.StringIO()
        with contextlib.redirect_stdout(buffer):
            exit_code = runner.main(
                [
                    "--dry-run",
                    "--repo-root",
                    str(REPO_ROOT),
                    "--module",
                    "apps-web",
                    "--output-dir",
                    str(output_dir),
                    "--run-dir",
                    str(run_dir),
                ]
            )

        output = buffer.getvalue()
        self.assertEqual(exit_code, 0)
        self.assertIn("apps-web", output)
        self.assertIn(str(output_dir.resolve() / "apps-web.md"), output)
        self.assertIn(str(run_dir.resolve() / "apps-web.final.md"), output)
        self.assertIn("--model codex2", output)
        self.assertIn("--dangerously-bypass-approvals-and-sandbox", output)

    def test_run_selected_modules_stops_after_failed_module(self):
        runner = load_runner()
        modules = runner.select_modules(["apps-web", "apps-console"])
        calls = []

        def fake_run_module_guide(**kwargs):
            module = kwargs["module"]
            calls.append(module.name)
            return runner.ModuleGuideResult(
                module=module.name,
                title=module.title,
                status="failed",
                returncode=1,
                duration_seconds=0.5,
                final_message="failed",
                guide_path=None,
                stdout_path=Path("stdout"),
                stderr_path=Path("stderr"),
                changed_files=[],
                missing_headings=[],
            )

        original = runner.run_module_guide
        runner.run_module_guide = fake_run_module_guide
        try:
            results = runner.run_selected_modules(
                repo_root=REPO_ROOT,
                modules=modules,
                run_dir=self.temp_dir / "run",
                timeout_minutes=1,
                model=None,
            )
        finally:
            runner.run_module_guide = original

        self.assertEqual(calls, ["apps-web"])
        self.assertEqual([result.status for result in results], ["failed"])

    def test_tracked_file_mutation_after_child_returns_unsafe_changes(self):
        runner = load_runner()
        module = runner.select_modules(["apps-web"])[0]

        status_calls = iter([[], [" M README.md"]])

        def fake_git_status(repo_root):
            return next(status_calls)

        def fake_git_sha(repo_root):
            return "abc123"

        def fake_subprocess_run(command, **kwargs):
            output_path = Path(command[command.index("--output-last-message") + 1])
            output_path.parent.mkdir(parents=True, exist_ok=True)
            output_path.write_text(self.complete_guide(module.title), encoding="utf-8")
            return subprocess.CompletedProcess(command, 0, stdout="", stderr="")

        original_status = runner.git_status
        original_sha = runner.git_sha
        original_run = runner.subprocess.run
        runner.git_status = fake_git_status
        runner.git_sha = fake_git_sha
        runner.subprocess.run = fake_subprocess_run
        try:
            result = runner.run_module_guide(
                repo_root=REPO_ROOT,
                module=module,
                run_dir=self.temp_dir / "run",
                timeout_minutes=1,
                model=None,
            )
        finally:
            runner.git_status = original_status
            runner.git_sha = original_sha
            runner.subprocess.run = original_run

        self.assertEqual(result.status, "unsafe_changes")
        self.assertEqual(result.changed_files, [" M README.md"])
        self.assertIn("changed tracked files", result.final_message)

    def test_write_testing_guides_writes_module_files_and_index_after_success(self):
        runner = load_runner()
        modules = runner.select_modules(["apps-web"])
        output_dir = self.temp_dir / "testing-guides"
        results = [self.result(runner)]

        written = runner.write_testing_guides(
            repo_root=REPO_ROOT,
            output_dir=output_dir,
            modules=modules,
            results=results,
            git_sha="abc123",
            started_at="2026-06-19T00:00:00Z",
            finished_at="2026-06-19T00:05:00Z",
        )

        guide = output_dir / "apps-web.md"
        index = output_dir / "index.md"
        self.assertIn(guide, written)
        self.assertIn(index, written)
        self.assertIn("# Marketing website and public UX Testing Guide", guide.read_text())
        index_text = index.read_text(encoding="utf-8")
        self.assertIn("# QuickVoice Testing Guides", index_text)
        self.assertIn("[Marketing website and public UX](apps-web.md)", index_text)

    def test_write_testing_guides_requires_all_modules_completed(self):
        runner = load_runner()
        modules = runner.select_modules(["apps-web"])

        with self.assertRaisesRegex(RuntimeError, "all module guide sessions"):
            runner.write_testing_guides(
                repo_root=REPO_ROOT,
                output_dir=self.temp_dir / "testing-guides",
                modules=modules,
                results=[self.result(runner, status="failed", final_message="failed")],
                git_sha="abc123",
                started_at="2026-06-19T00:00:00Z",
                finished_at="2026-06-19T00:05:00Z",
            )


if __name__ == "__main__":
    unittest.main()
