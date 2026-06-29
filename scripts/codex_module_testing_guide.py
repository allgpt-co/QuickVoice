#!/usr/bin/env python3
"""Generate module-specific QuickVoice testing guides with sequential Codex runs.

The child Codex sessions run with full permissions because that is the requested
execution mode, but their prompt is read-only. The parent runner only writes the
committed testing guide files after every selected module returns a valid guide.
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass
from datetime import datetime, timezone
import json
from pathlib import Path
import subprocess
import sys
import time
from typing import Sequence


SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from codex_module_audit import (  # noqa: E402
    AuditModule,
    build_codex_command as build_base_codex_command,
    display_path,
    git_sha,
    git_status,
    require_git_repo,
    select_modules,
    write_text,
)


DEFAULT_CODEX_MODEL = "codex2"

REQUIRED_GUIDE_HEADINGS: tuple[str, ...] = (
    "## Intern Testing Orientation",
    "## Module Overview",
    "## Architecture And Data Flow Testing",
    "## Setup And Required Services",
    "## Automated Test Commands",
    "## Functional Test Cases",
    "## SaaS Business And Operations Test Cases",
    "## Integration And API Test Cases",
    "## Non-Functional Test Cases",
    "## UX, UI, Accessibility, And Compatibility Testing",
    "## Security, Privacy, And Compliance Checks",
    "## Edge Cases And Failure Modes",
    "## Test Data, Fixtures, Accounts, And Roles",
    "## External Services Or Blocked Checks",
    "## Regression Risks",
    "## Release Acceptance Checklist",
)


@dataclass(frozen=True)
class ModuleGuideResult:
    module: str
    title: str
    status: str
    returncode: int | None
    duration_seconds: float
    final_message: str
    guide_path: Path | None
    stdout_path: Path
    stderr_path: Path
    changed_files: list[str]
    missing_headings: list[str]


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def guide_filename(module: AuditModule) -> str:
    return f"{module.name}.md"


def expected_title_heading(module: AuditModule) -> str:
    return f"# {module.title} Testing Guide"


def required_headings(module: AuditModule) -> tuple[str, ...]:
    return (expected_title_heading(module), *REQUIRED_GUIDE_HEADINGS)


def build_codex_command(
    repo_root: Path,
    module: AuditModule,
    output_last_message: Path,
    *,
    model: str | None = None,
) -> list[str]:
    """Build the Codex command for one intern testing guide session."""
    return build_base_codex_command(
        repo_root=repo_root,
        module=module,
        output_last_message=output_last_message,
        model=model if model is not None else DEFAULT_CODEX_MODEL,
    )


def missing_required_headings(module: AuditModule, markdown: str) -> list[str]:
    lines = {line.strip() for line in markdown.splitlines()}
    return [heading for heading in required_headings(module) if heading not in lines]


def build_testing_guide_prompt(module: AuditModule, git_sha: str) -> str:
    paths = "\n".join(f"- `{path}`" for path in module.paths)
    headings = "\n".join(f"- `{heading}`" for heading in required_headings(module))
    return f"""You are creating a detailed intern testing guide for one QuickVoice module.

Module: {module.name}
Title: {module.title}
Repository commit: {git_sha}

Scope paths:
{paths}

Module focus:
{module.focus}

Rules:
- Do not edit any repository files.
- Do not create, delete, format, migrate, or commit any repository files.
- Do not write guide files yourself; the parent runner will save your final Markdown if it passes validation.
- You may inspect files and run read-only checks, but do not run commands that rewrite tracked files.
- This is one module in a sequential guide run; return a complete guide for this module only.
- Do not ask to move to the next module. The runner will stop unless this module is finished successfully.
- Make the guide actionable for an intern tester who has basic command-line skills but limited QuickVoice context.
- Write concrete pass/fail criteria for every manual scenario and every blocked check.
- Include exact files, routes, commands, API endpoints, environment variables, services, roles, fixtures, and setup steps when you can prove them from the repository.
- Cover SaaS concerns where relevant: authentication, onboarding, organizations/tenants, RBAC, billing, settings, customer data boundaries, lifecycle states, support handoff, operational monitoring, retention, and auditability.
- Cover architecture testing where relevant: module boundaries, data flow, API contracts, database models, background jobs, queues, workers, provider dependencies, configuration, observability, failure handling, and rollback risk.
- Cover functional testing for all small user-facing and operator-facing features in scope, including happy paths, empty states, loading states, validation, errors, and permission-specific behavior.
- Cover integration and API testing for internal APIs, external providers, webhooks, auth/session dependencies, persistence, file/object storage, telephony, AI services, and network failure modes where applicable.
- Cover non-functional testing: performance, reliability, resilience, security, privacy, accessibility, compatibility, data integrity, concurrency, rate limits, and recovery behavior.
- Cover UX/UI testing: layout, visual hierarchy, responsive breakpoints, keyboard support, screen reader cues, browser/device compatibility, copy clarity, forms, tables, dialogs, toasts, and destructive actions.
- Include test data, accounts, roles, fixtures, service credentials, and local seed requirements where discoverable.
- Include regression risks and release acceptance checks an intern can follow without guessing.
- If credentials, paid services, or live vendors are unavailable, mark the check as blocked rather than guessing.

Return Markdown only. It must contain these exact headings:
{headings}
"""


def status_path(status_line: str) -> str:
    path = status_line[3:].strip() if len(status_line) > 3 else status_line.strip()
    return path.split(" -> ")[-1]


def is_under(path: Path, parent: Path) -> bool:
    try:
        path.resolve().relative_to(parent.resolve())
        return True
    except ValueError:
        return False


def status_delta(
    before_status: Sequence[str],
    after_status: Sequence[str],
    repo_root: Path,
    ignored_roots: Sequence[Path],
) -> list[str]:
    before = set(before_status)
    changed: list[str] = []
    for line in after_status:
        if line in before:
            continue
        raw_path = status_path(line)
        path = Path(raw_path)
        absolute_path = path if path.is_absolute() else repo_root / path
        if any(is_under(absolute_path, ignored_root) for ignored_root in ignored_roots):
            continue
        changed.append(line)
    return sorted(changed)


def read_final_message(final_path: Path) -> str:
    if not final_path.exists():
        return ""
    return final_path.read_text(encoding="utf-8").strip()


def run_module_guide(
    repo_root: Path,
    module: AuditModule,
    run_dir: Path,
    *,
    timeout_minutes: int,
    model: str | None,
) -> ModuleGuideResult:
    module_prefix = run_dir / module.name
    stdout_path = module_prefix.with_suffix(".stdout.jsonl")
    stderr_path = module_prefix.with_suffix(".stderr.log")
    final_path = module_prefix.with_suffix(".final.md")
    prompt_path = module_prefix.with_suffix(".prompt.md")

    prompt = build_testing_guide_prompt(module, git_sha=git_sha(repo_root))
    write_text(prompt_path, prompt)

    before_status = git_status(repo_root)
    command = build_codex_command(
        repo_root=repo_root,
        module=module,
        output_last_message=final_path,
        model=model,
    )

    started = time.monotonic()
    try:
        result = subprocess.run(
            command,
            cwd=repo_root,
            input=prompt,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=timeout_minutes * 60,
            check=False,
        )
        returncode: int | None = result.returncode
        stdout = result.stdout
        stderr = result.stderr
        status = "completed" if result.returncode == 0 else "failed"
    except subprocess.TimeoutExpired as exc:
        returncode = None
        stdout = exc.stdout if isinstance(exc.stdout, str) else ""
        stderr = exc.stderr if isinstance(exc.stderr, str) else ""
        stderr = f"{stderr}\nTimed out after {timeout_minutes} minutes.\n"
        status = "timed_out"

    duration = time.monotonic() - started
    final_message = read_final_message(final_path)

    after_status = git_status(repo_root)
    changed_files = status_delta(before_status, after_status, repo_root, [run_dir])

    write_text(stdout_path, stdout)
    write_text(stderr_path, stderr)

    if changed_files:
        status = "unsafe_changes"
        diagnostic = (
            "\n\nRunner stopped because the Codex session changed tracked files:\n"
            + "\n".join(f"- `{path}`" for path in changed_files)
        )
        final_message = (final_message or stderr.strip() or stdout.strip()).strip()
        final_message = f"{final_message}{diagnostic}" if final_message else diagnostic
        missing_headings: list[str] = []
    elif status == "completed" and not final_message:
        status = "empty_guide"
        final_message = stderr.strip() or stdout.strip() or "No final guide captured."
        missing_headings = list(required_headings(module))
    elif status == "completed":
        missing_headings = missing_required_headings(module, final_message)
        if missing_headings:
            status = "invalid_guide"
            final_message = (
                f"{final_message}\n\n"
                "Runner stopped because the guide missed required headings:\n"
                + "\n".join(f"- `{heading}`" for heading in missing_headings)
            )
    else:
        final_message = final_message or stderr.strip() or stdout.strip()
        if not final_message:
            final_message = "No final guide captured."
        missing_headings = []

    return ModuleGuideResult(
        module=module.name,
        title=module.title,
        status=status,
        returncode=returncode,
        duration_seconds=duration,
        final_message=final_message,
        guide_path=None,
        stdout_path=display_path(stdout_path, repo_root),
        stderr_path=display_path(stderr_path, repo_root),
        changed_files=changed_files,
        missing_headings=missing_headings,
    )


def run_selected_modules(
    repo_root: Path,
    modules: Sequence[AuditModule],
    run_dir: Path,
    *,
    timeout_minutes: int,
    model: str | None,
) -> list[ModuleGuideResult]:
    results: list[ModuleGuideResult] = []
    for module in modules:
        result = run_module_guide(
            repo_root=repo_root,
            module=module,
            run_dir=run_dir,
            timeout_minutes=timeout_minutes,
            model=model,
        )
        results.append(result)
        if result.status != "completed":
            break
    return results


def render_index_markdown(
    repo_root: Path,
    modules: Sequence[AuditModule],
    results: Sequence[ModuleGuideResult],
    git_sha: str,
    started_at: str,
    finished_at: str,
) -> str:
    result_by_module = {result.module: result for result in results}
    lines = [
        "# QuickVoice Testing Guides",
        "",
        f"- Repository: `{repo_root}`",
        f"- Commit: `{git_sha}`",
        f"- Started: `{started_at}`",
        f"- Finished: `{finished_at}`",
        "",
        "These intern testing guides were generated by `scripts/codex_module_testing_guide.py`, which runs one read-only Codex session per module and saves guides only after every selected module succeeds.",
        "",
        "## Modules",
        "",
    ]
    for module in modules:
        result = result_by_module[module.name]
        lines.append(
            f"- [{module.title}]({guide_filename(module)}) - `{module.name}` ({result.status})"
        )
    lines.append("")
    return "\n".join(lines)


def write_testing_guides(
    repo_root: Path,
    output_dir: Path,
    modules: Sequence[AuditModule],
    results: Sequence[ModuleGuideResult],
    *,
    git_sha: str,
    started_at: str,
    finished_at: str,
) -> list[Path]:
    if len(results) != len(modules) or any(
        result.status != "completed" for result in results
    ):
        raise RuntimeError(
            "Cannot write testing guides until all module guide sessions complete."
        )

    result_by_module = {result.module: result for result in results}
    for module in modules:
        result = result_by_module.get(module.name)
        if result is None:
            raise RuntimeError(f"Missing guide result for module: {module.name}")
        missing_headings = missing_required_headings(module, result.final_message)
        if missing_headings:
            raise RuntimeError(
                f"Guide for {module.name} is missing headings: "
                + ", ".join(missing_headings)
            )

    written: list[Path] = []
    for module in modules:
        result = result_by_module[module.name]
        guide_path = output_dir / guide_filename(module)
        write_text(guide_path, result.final_message.strip() + "\n")
        written.append(guide_path)

    index_path = output_dir / "index.md"
    write_text(
        index_path,
        render_index_markdown(
            repo_root=repo_root,
            modules=modules,
            results=results,
            git_sha=git_sha,
            started_at=started_at,
            finished_at=finished_at,
        ),
    )
    written.append(index_path)
    return written


def results_json(results: Sequence[ModuleGuideResult]) -> str:
    payload = [
        {
            "module": result.module,
            "title": result.title,
            "status": result.status,
            "returncode": result.returncode,
            "duration_seconds": result.duration_seconds,
            "final_message": result.final_message,
            "guide_path": str(result.guide_path) if result.guide_path else None,
            "stdout_path": str(result.stdout_path),
            "stderr_path": str(result.stderr_path),
            "changed_files": result.changed_files,
            "missing_headings": result.missing_headings,
        }
        for result in results
    ]
    return json.dumps(payload, indent=2) + "\n"


def parse_args(argv: Sequence[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run sequential full-permission Codex sessions to generate module testing guides."
    )
    parser.add_argument(
        "--module",
        action="append",
        dest="modules",
        help="Module to document. Repeat for multiple modules. Defaults to all modules.",
    )
    parser.add_argument(
        "--repo-root",
        type=Path,
        default=Path.cwd(),
        help="Repository root. Defaults to current directory.",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path("testing-guides"),
        help="Directory for committed testing guides. Default: testing-guides.",
    )
    parser.add_argument(
        "--run-dir",
        type=Path,
        default=None,
        help="Directory for run logs. Defaults to .testing_guide_runs/<timestamp>.",
    )
    parser.add_argument(
        "--timeout-minutes",
        type=int,
        default=90,
        help="Timeout for each module Codex session. Default: 90.",
    )
    parser.add_argument(
        "--model",
        default=None,
        help=f"Optional Codex model override. Defaults to {DEFAULT_CODEX_MODEL}.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print selected modules and commands without running Codex.",
    )
    return parser.parse_args(argv)


def resolve_path(repo_root: Path, path: Path) -> Path:
    return path.resolve() if path.is_absolute() else (repo_root / path).resolve()


def print_dry_run(
    repo_root: Path,
    modules: Sequence[AuditModule],
    output_dir: Path,
    run_dir: Path,
    *,
    model: str | None,
) -> None:
    print(f"Repo root: {repo_root}")
    print(f"Output dir: {output_dir}")
    print(f"Run dir: {run_dir}")
    for module in modules:
        final_path = run_dir / f"{module.name}.final.md"
        command = build_codex_command(
            repo_root=repo_root,
            module=module,
            output_last_message=final_path,
            model=model,
        )
        print(f"\n[{module.name}] {module.title}")
        print("Paths: " + ", ".join(module.paths))
        print(f"Guide output: {output_dir / guide_filename(module)}")
        print("Command: " + " ".join(command))


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(sys.argv[1:] if argv is None else argv)
    repo_root = args.repo_root.resolve()

    try:
        modules = select_modules(args.modules)
    except ValueError as exc:
        print(str(exc), file=sys.stderr)
        return 2

    if args.timeout_minutes < 1:
        print("--timeout-minutes must be at least 1", file=sys.stderr)
        return 2

    started_at = utc_now()
    stamp = started_at.replace(":", "").replace("+00:00", "Z")
    output_dir = resolve_path(repo_root, args.output_dir)
    run_dir = resolve_path(
        repo_root, args.run_dir or Path(".testing_guide_runs") / stamp
    )

    if args.dry_run:
        print_dry_run(
            repo_root=repo_root,
            modules=modules,
            output_dir=output_dir,
            run_dir=run_dir,
            model=args.model,
        )
        return 0

    try:
        require_git_repo(repo_root)
    except RuntimeError as exc:
        print(str(exc), file=sys.stderr)
        return 2

    starting_sha = git_sha(repo_root)
    run_dir.mkdir(parents=True, exist_ok=True)

    print(f"Running {len(modules)} module testing guide session(s) in {repo_root}")
    print(f"Logs: {run_dir}")
    results = run_selected_modules(
        repo_root=repo_root,
        modules=modules,
        run_dir=run_dir,
        timeout_minutes=args.timeout_minutes,
        model=args.model,
    )

    for result in results:
        print(f"{result.module}: {result.status} in {result.duration_seconds:.1f}s")

    finished_at = utc_now()
    write_text(run_dir / "results.json", results_json(results))

    if len(results) != len(modules) or any(
        result.status != "completed" for result in results
    ):
        print(
            "Stopping before writing testing guides because a module did not complete.",
            file=sys.stderr,
        )
        return 1

    written = write_testing_guides(
        repo_root=repo_root,
        output_dir=output_dir,
        modules=modules,
        results=results,
        git_sha=starting_sha,
        started_at=started_at,
        finished_at=finished_at,
    )
    print("Wrote testing guides:")
    for path in written:
        print(f"- {display_path(path, repo_root)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
