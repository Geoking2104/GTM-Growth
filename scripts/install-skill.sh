#!/usr/bin/env bash
# Install the GTM Growth skill for Claude Code and/or Codex.
# MCP server name is google-growth.
# Usage:
#   ./scripts/install-skill.sh claude
#   ./scripts/install-skill.sh codex
#   ./scripts/install-skill.sh both
#   ./scripts/install-skill.sh claude --user
#   ./scripts/install-skill.sh codex --link

set -euo pipefail

TARGET="${1:-both}"
MODE="copy"
SCOPE="project"

shift || true
while [[ $# -gt 0 ]]; do
  case "$1" in
    --link) MODE="link" ;;
    --user) SCOPE="user" ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
  shift
done

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/skills/google-growth"

if [[ ! -f "$SRC/SKILL.md" ]]; then
  echo "Skill not found at $SRC" >&2
  exit 1
fi

install_one() {
  local dest="$1"
  mkdir -p "$(dirname "$dest")"
  rm -rf "$dest"
  if [[ "$MODE" == "link" ]]; then
    ln -s "$SRC" "$dest"
    echo "Linked $dest -> $SRC"
  else
    cp -R "$SRC" "$dest"
    echo "Copied skill to $dest"
  fi
}

claude_dest()
{
  if [[ "$SCOPE" == "user" ]]; then
    echo "$HOME/.claude/skills/google-growth"
  else
    echo "$ROOT/.claude/skills/google-growth"
  fi
}

codex_dest()
{
  if [[ "$SCOPE" == "user" ]]; then
    echo "$HOME/.codex/skills/google-growth"
  else
    echo "$ROOT/.codex/skills/google-growth"
  fi
}

case "$TARGET" in
  claude) install_one "$(claude_dest)" ;;
  codex)  install_one "$(codex_dest)" ;;
  both)
    install_one "$(claude_dest)"
    install_one "$(codex_dest)"
    ;;
  *)
    echo "Usage: $0 {claude|codex|both} [--user] [--link]" >&2
    exit 1
    ;;
esac

echo "Done. Restart Claude Code / Codex if the skill does not appear."
echo "MCP server name is google-growth. See docs/CLAUDE_SETUP.md and docs/CODEX_SETUP.md."
