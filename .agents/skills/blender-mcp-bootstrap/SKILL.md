---
name: blender-mcp-bootstrap
description: Install, register, secure, diagnose, and verify the ahujasid/blender-mcp bridge for Codex and Blender. Use when Blender MCP is requested, absent, disconnected, missing from Codex tools, or unable to read the Blender scene.
---

# Blender MCP Bootstrap

This skill establishes connectivity. It does not replace `$blender-character-modeling` or the repository's deterministic headless asset pipeline.

## Preferred stack

- community bridge: `ahujasid/blender-mcp`
- Codex STDIO command: `uvx blender-mcp`
- Blender add-on: `Interface: MCP for Blender`
- Blender socket: `127.0.0.1:9876`

Do not install a second competing Blender MCP when a healthy `blender` server already exists.

## Procedure

1. Inspect OS, Blender version, `uv`, `uvx`, the real Codex CLI path, `codex mcp list`, existing add-on files, and port 9876 before changing anything.
2. Install `uv` from Astral's official installer only when missing. On managed Windows networks, use uv's native certificate store support instead of disabling TLS verification.
3. Prefer uv-managed Python 3.11 for the MCP environment.
4. Register a single global Codex server named `blender`. GUI clients should use the absolute `uvx` path.
5. Disable MCP telemetry unless the user explicitly asks to enable it. Leave Poly Haven, Sketchfab, Poly Pizza, Hyper3D, and Hunyuan integrations disabled unless requested.
6. Install or update the Blender add-on with `uvx blender-mcp install-addon`.
7. Enable the add-on in Blender preferences. A GUI Blender process is required to run its socket server; background Blender cannot execute MCP commands.
8. Verify port 9876, list MCP tools, and perform a harmless `get_scene_info` call before modeling.
9. Restart Codex after registration if the tools are not present in the current task.

## Windows

Prefer `scripts/setup_blender_mcp_windows.ps1`. The intended registration is equivalent to:

```powershell
codex mcp add blender `
  --env DISABLE_TELEMETRY=true `
  --env UV_SYSTEM_CERTS=true `
  --env UV_PYTHON_PREFERENCE=only-managed `
  -- "$env:USERPROFILE\.local\bin\uvx.exe" --python 3.11 --no-python-downloads blender-mcp
```

The add-on installer normally writes to `%APPDATA%\Blender Foundation\Blender\<version>\scripts\addons`. A repository headless wrapper may intentionally redirect Blender user resources to a temporary directory; do not mistake that isolated headless path for the normal GUI add-on location.

## macOS and Linux

Follow the current official uv and `ahujasid/blender-mcp` installation instructions. Resolve the absolute `uvx` path for a GUI-launched Codex client, use Python 3.11 when practical, and set `DISABLE_TELEMETRY=true`.

## Verification

All of the following must pass:

- `codex mcp list` shows exactly one enabled `blender` entry;
- Blender has `Interface: MCP for Blender` enabled;
- `127.0.0.1:9876` is listening while Blender GUI is open;
- the MCP server advertises tools;
- `get_scene_info` returns scene data without modifying the scene.

Do not begin destructive modeling before all five checks pass.

## Failure order

1. Confirm the absolute `uvx` path.
2. Use `UV_SYSTEM_CERTS=true` for a managed Windows certificate chain; never turn off certificate validation.
3. Run `uvx blender-mcp addon-paths` and compare it with Blender's actual GUI user scripts path.
4. Confirm the add-on is enabled and Blender GUI is listening on 9876.
5. Confirm `codex mcp list` and fully restart Codex.
6. Check for a second Blender or MCP process competing for the same port.

Report the exact failed step and preserve unrelated MCP configuration.
