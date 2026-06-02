#!/usr/bin/env python3
"""
Enhanced Orchestrator - Analyzes user requests and generates multi-agent implementation plans.
Uses Anthropic Claude API to understand repository context and generate structured plans.
"""

import json
import os
import sys
from pathlib import Path
from typing import Optional

import anthropic


def read_file(path: str) -> Optional[str]:
    """Safely read file contents."""
    try:
        return Path(path).read_text(encoding="utf-8")
    except (FileNotFoundError, IsADirectoryError, PermissionError):
        return None


def get_repo_structure(repo_root: str) -> str:
    """Generate repository structure overview."""
    structure = []
    repo_path = Path(repo_root)

    # Key directories to analyze
    key_dirs = [
        "src",
        "api",
        ".github/workflows",
        "migrations" if (repo_path / "migrations").exists() else None,
    ]

    for dir_name in key_dirs:
        if dir_name is None:
            continue

        dir_path = repo_path / dir_name
        if not dir_path.exists():
            continue

        structure.append(f"\n### {dir_name}/")
        try:
            for file_path in sorted(dir_path.rglob("*")):
                if (
                    file_path.is_file()
                    and not file_path.name.startswith(".")
                    and "node_modules" not in str(file_path)
                ):
                    rel_path = str(file_path.relative_to(repo_path))
                    structure.append(f"  {rel_path}")
        except PermissionError:
            structure.append(f"  [permission denied]")

    return "\n".join(structure[:100])  # Limit to 100 lines


def load_orchestrator_prompt(repo_root: str) -> str:
    """Load the orchestrator system prompt."""
    prompt_path = Path(repo_root) / "ORCHESTRATOR_PROMPT.md"
    if prompt_path.exists():
        return prompt_path.read_text(encoding="utf-8")

    return """You are an intelligent task orchestrator for a full-stack web application.
Analyze the user request and generate a structured implementation plan with:
- summary: What will be done
- difficulty: easy|medium|hard
- agents: List of AI agents with tasks and files
- estimatedTime: In minutes
- risks: Potential issues and mitigations
- implementation_approach: Step-by-step plan"""


def create_orchestrator_request(
    user_request: str, repo_root: str = "."
) -> dict:
    """Create a structured request for the orchestrator."""

    # Read key files
    package_json = read_file(f"{repo_root}/package.json")
    git_status = read_file(f"{repo_root}/.git/config")
    repo_structure = get_repo_structure(repo_root)

    context = f"""## Repository Information

### Package.json (Tech Stack)
{package_json or "[package.json not found]"}

### Repository Structure
{repo_structure}

### Current Branch
{read_file(f"{repo_root}/.git/HEAD") or "[git info not available]"}
"""

    return {
        "user_request": user_request,
        "repo_context": context,
    }


def orchestrate(user_request: str, repo_root: str = ".") -> dict:
    """
    Main orchestration function.

    Takes a user request and repository context, returns a structured implementation plan.
    """

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise ValueError("ANTHROPIC_API_KEY environment variable not set")

    client = anthropic.Anthropic(api_key=api_key)

    # Load orchestrator prompt
    system_prompt = load_orchestrator_prompt(repo_root)

    # Create request with repo context
    request_data = create_orchestrator_request(user_request, repo_root)

    # Call Claude with structured output
    print("Analyzing request and repository context...", file=sys.stderr)

    message = client.messages.create(
        model="claude-3-5-sonnet-20241022",
        max_tokens=4096,
        system=system_prompt,
        messages=[
            {
                "role": "user",
                "content": f"""
# Repository Context
{request_data['repo_context']}

# User Request
{request_data['user_request']}

Please analyze this request and generate a structured implementation plan.
Return ONLY valid JSON matching the plan structure (no markdown, no code blocks).
""",
            }
        ],
    )

    # Extract response
    response_text = message.content[0].text

    # Try to parse as JSON
    try:
        # Remove markdown code blocks if present
        if response_text.startswith("```"):
            response_text = response_text.split("```")[1]
            if response_text.startswith("json"):
                response_text = response_text[4:]
        response_text = response_text.strip()

        plan = json.loads(response_text)
        return plan
    except json.JSONDecodeError as e:
        print(f"Warning: Failed to parse response as JSON: {e}", file=sys.stderr)
        return {
            "error": "Failed to parse orchestrator response",
            "raw_response": response_text,
        }


def format_plan(plan: dict) -> str:
    """Format the orchestration plan for display."""

    if "error" in plan:
        return f"Error: {plan['error']}\n\n{plan.get('raw_response', '')}"

    lines = []
    lines.append("=" * 80)
    lines.append("ORCHESTRATION PLAN")
    lines.append("=" * 80)
    lines.append("")

    # Summary
    lines.append(f"Summary: {plan.get('summary', 'N/A')}")
    lines.append(f"Difficulty: {plan.get('difficulty', 'N/A')}")
    lines.append("")

    # Scope
    if "scope" in plan:
        scope = plan["scope"]
        lines.append("Scope:")
        lines.append(f"  Type: {scope.get('type', 'N/A')}")
        lines.append(
            f"  Domains: {', '.join(scope.get('affectedDomains', []))}"
        )
        lines.append(
            f"  Files Modified: ~{scope.get('estimatedFilesModified', 0)}"
        )
        lines.append(
            f"  Files Created: ~{scope.get('estimatedFilesCreated', 0)}"
        )
        lines.append("")

    # Agents
    if "agents" in plan:
        lines.append("Agents & Tasks:")
        for agent in plan["agents"]:
            lines.append(f"\n  [{agent.get('priority', '?')}] {agent.get('name', 'Unknown')}")
            lines.append(
                f"      Task: {agent.get('task', 'N/A')}"
            )
            lines.append(
                f"      Duration: ~{agent.get('estimatedDuration', 0)} min"
            )

            if "files" in agent and agent["files"]:
                lines.append("      Files:")
                for file_info in agent["files"]:
                    action = file_info.get("action", "modify").upper()
                    lines.append(
                        f"        [{action}] {file_info.get('path', 'unknown')}"
                    )

            if "dependencies" in agent and agent["dependencies"]:
                deps = ", ".join(agent["dependencies"])
                lines.append(f"      Dependencies: {deps}")

        lines.append("")

    # Timeline
    lines.append(f"Estimated Total Time: {plan.get('estimatedTime', 'N/A')} minutes")
    lines.append("")

    # Risks
    if "risks" in plan and plan["risks"]:
        lines.append("Risks & Mitigations:")
        for risk in plan["risks"]:
            severity = risk.get("severity", "unknown").upper()
            category = risk.get("category", "unknown")
            lines.append(f"\n  [{severity}] {category}")
            lines.append(f"      Description: {risk.get('description', 'N/A')}")
            lines.append(f"      Mitigation: {risk.get('mitigation', 'N/A')}")

        lines.append("")

    # Implementation approach
    if "implementation_approach" in plan:
        lines.append("Implementation Approach:")
        approach = plan["implementation_approach"]
        for line in approach.split("\n"):
            lines.append(f"  {line}")

    lines.append("")
    lines.append("=" * 80)

    return "\n".join(lines)


def main():
    """CLI entry point."""
    if len(sys.argv) < 2:
        print("Usage: orchestrator.py '<user request>'")
        print("\nExample:")
        print(
            "  orchestrator.py 'Add dark mode toggle to the application'"
        )
        sys.exit(1)

    user_request = " ".join(sys.argv[1:])
    repo_root = os.getcwd()

    plan = orchestrate(user_request, repo_root)
    print(format_plan(plan))

    # Also output raw JSON for programmatic use
    print("\n" + "=" * 80)
    print("RAW PLAN (JSON):")
    print("=" * 80)
    print(json.dumps(plan, indent=2))


if __name__ == "__main__":
    main()
