#!/bin/bash
# Auto-setup skills symlinks and start autoresearch dashboard server on session start

# Create skill symlinks so skills appear in / menu
SKILLS_DIR="$HOME/.claude/skills"

setup_skill_symlink() {
    local skill_name="$1"
    local skill_path="$CLAUDE_PLUGIN_ROOT/skills/$skill_name/SKILL.md"
    local link_dir="$SKILLS_DIR/$skill_name"
    local link_path="$link_dir/SKILL.md"

    if [ -f "$skill_path" ] && [ ! -L "$link_path" ]; then
        mkdir -p "$link_dir"
        ln -sf "$skill_path" "$link_path"
    fi
}

setup_skill_symlink "auto-research"
setup_skill_symlink "autoresearch-dashboard"

# Auto-start autoresearch dashboard server
SERVER="$CLAUDE_PLUGIN_ROOT/skills/autoresearch-dashboard/server.py"
if ! pgrep -f "autoresearch-dashboard/server.py" > /dev/null 2>&1; then
    nohup python3 "$SERVER" > /tmp/rdb-server.log 2>&1 &
fi
