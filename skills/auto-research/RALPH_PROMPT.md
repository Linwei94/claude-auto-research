# Ralph Loop Debug Task

Read these files and fix any issues found:

1. Read /home/linwei/.claude/skills/autoresearch-dashboard/tracker.py
   - Verify pending_dir flows correctly: Run.__init__ -> _save_offline
   - Verify the init() docstring matches the actual parameter behavior
   - Confirm no regression in existing offline behavior

2. Read /home/linwei/.claude/skills/auto-research/phases/experiments.md  
   - Find the "Offline clusters" section (search for "C500 platform / Gadi")
   - Verify tracker.init() example uses pending_dir parameter correctly
   - Verify the rsync+sync commands are complete and accurate
   - Check: does the live monitoring loop handle errors (ssh fail, rsync fail) gracefully?
   - Fix: add 2>/dev/null to rsync to suppress "no such file" noise when pending_sync is empty

3. Read /home/linwei/.claude/skills/auto-research/phases/setup.md
   - Find the cluster selection section  
   - Verify it mentions the correct AFS path for C500 pending_sync

4. Check if shared/cluster-sync.md exists - if not, create it with the full sync commands
   for both C500 and Gadi as a quick reference card.

Fix any issues you find. When all files are consistent and complete, output:
<promise>CLUSTER_SYNC_DEBUGGED</promise>
