"""Run the crew's agents through headless Claude Code instead of the API.

    .venv/bin/python crew.py briefs/rustmoor-silk-storylet.md --claude-code

Stands in for anthropic.Anthropic() with the same messages.create call, but
each call runs `claude -p` with the agent's system prompt and the output
schema, so it bills to the Claude plan Claude Code is logged in with rather
than to API credits. Each call gets no tools, no MCP servers and no project
settings: the agent sees only its system prompt and the message the crew built.
"""

import json
import subprocess
import tempfile
import types

TIMEOUT = 15 * 60  # seconds per agent call


class _Messages:
    def create(self, *, model, system, messages, output_config, **_):
        schema = output_config["format"]["schema"]
        cmd = ["claude", "-p",
               "--model", model,
               "--effort", output_config.get("effort", "medium"),
               "--system-prompt", system,
               "--json-schema", json.dumps(schema),
               "--output-format", "json",
               "--tools", "",
               "--strict-mcp-config",
               "--setting-sources", "",
               "--no-session-persistence"]
        with tempfile.TemporaryDirectory() as cwd:  # nothing in the project to pick up
            proc = subprocess.run(cmd, input=messages[-1]["content"], capture_output=True,
                                  text=True, cwd=cwd, timeout=TIMEOUT)
        try:
            out = json.loads(proc.stdout)
        except json.JSONDecodeError:
            raise RuntimeError(f"claude -p failed ({proc.returncode}): {proc.stderr.strip() or proc.stdout.strip()}")
        if out.get("is_error") or out.get("structured_output") is None:
            raise RuntimeError(f"claude -p returned no structured output: {out.get('result')}")
        usage = out.get("usage", {})
        return types.SimpleNamespace(
            stop_reason="end_turn",
            stop_details=None,
            content=[types.SimpleNamespace(type="text", text=json.dumps(out["structured_output"]))],
            usage=types.SimpleNamespace(
                input_tokens=usage.get("input_tokens", 0)
                + usage.get("cache_creation_input_tokens", 0)
                + usage.get("cache_read_input_tokens", 0),
                output_tokens=usage.get("output_tokens", 0)),
        )


class ClaudeCodeClient:
    def __init__(self):
        self.beta = types.SimpleNamespace(messages=_Messages())
