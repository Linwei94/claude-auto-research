# Ralph Task: Fix Sidebar Resize

## Problem

The sidebar in `/home/linwei/.claude/skills/autoresearch-dashboard/frontend/` has three collapsible sections:
1. **Projects block** (project-list)
2. **Progress block** (phase-section + phase-group-list)
3. **Nav tabs block** (nav#nav)

Two resize handles were added (sb-resize-1, sb-resize-2) but the user reports:
- **"拖拉很奇怪"** — drag behavior is weird/broken
- **"上面gpu的板块不能缩小"** — the top block (projects) can't be shrunk

## Root causes to investigate and fix

Read these files first:
- `frontend/index.html` — sidebar HTML + CSS
- `frontend/app.js` — setupResize() and init()

Likely issues:
1. **Sidebar overflow**: `#sidebar` has `overflow: hidden`. Flex children with explicit `height` fight with the flex layout — resizing one child doesn't properly redistribute space to others, causing weird visual behaviour.
2. **Flex layout conflict**: `project-list` has `flex-shrink: 0` but the sidebar uses flex column. When project-list height is set via JS, the nav (which has `flex: 1`) may not respond correctly.
3. **The handle positions may be off**: sb-resize-2 is INSIDE phase-section, meaning it's hidden when phase-section is `display:none`. When it appears, the visual position might be wrong.
4. **Mouse coordinate bug**: The drag uses `clientY` from mousemove events — check if these are correct, or if the element's own scrolling is interfering.

## Required fix

Redesign the resize system so it actually works:

**Approach**: Use a single "available height" calculation.  
The sidebar height is fixed (100vh). The header, GPU nav, project label, and stats take fixed amounts. The remaining height must be divided between:
- project-list
- phase-section (when visible)
- nav tabs

Use a proper flex-based approach:
- Give project-list, phase-group-list, and nav explicit `flex: 0 0 <px>` with `overflow-y: auto`
- Resize handles change these values
- On drag of handle 1: change project-list height
- On drag of handle 2 (only visible when phase-section shown): change phase-group-list height
- The nav should take whatever's left (flex: 1, min-height: 96px)

**Constraints**:
- project-list: min 32px, max 250px, default 100px
- phase-group-list: min 48px, max 280px, default 140px
- Nav tabs: min 96px (enough for 4 links), should grow/shrink with remaining space
- Both values saved to localStorage (keys: `rdb:proj-h`, `rdb:phase-h`)
- The handle should visually show a `::`-style grip icon (dots) in the center when hovered

## Output

Fix the CSS and JS. Make it work properly. 

Completion: output `<promise>SIDEBAR_RESIZE_FIXED</promise>` when drag works correctly in both directions, top block can be shrunk, and nav expands to fill remaining space.
