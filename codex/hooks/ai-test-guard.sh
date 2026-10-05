#!/usr/bin/env bash
# Codex UserPromptSubmit hook for AI Automation Test.
#
# Kept separate from .claude/hooks so Codex setup can be installed/uninstalled
# without touching Claude Code files.

set +e

command -v jq >/dev/null 2>&1 || exit 0

payload="$(cat)"
prompt="$(printf '%s' "$payload" | jq -r '.prompt // empty' 2>/dev/null)"
[ -z "$prompt" ] && exit 0

marker_line="$(printf '%s\n' "$prompt" | grep -m1 'AITEST_GUARD ARGS_BEGIN>>>')"
[ -z "$marker_line" ] && exit 0

args="$(printf '%s' "$marker_line" | sed -E 's/.*ARGS_BEGIN>>>(.*)<<<ARGS_END.*/\1/')"

has_project=0
if printf '%s' "$args" | grep -Eq -- '--project([= ])[^ ]'; then has_project=1; fi

stripped="$(printf '%s' "$args" | sed -E 's/--[^ ]+//g' | xargs 2>/dev/null)"
has_input=0
[ -n "$stripped" ] && has_input=1

if printf '%s' "$args" | grep -Eq -- '(^| )--rerun( |$)'; then has_input=1; fi

problems=""
[ "$has_project" -eq 0 ] && problems="${problems}\n- Thieu --project=<ten-project>"
[ "$has_input" -eq 0 ] && problems="${problems}\n- Thieu input (Google Sheet URL / URL web / file spec / mo ta)"

[ -z "$problems" ] && exit 0

reason="$(printf 'Lenh ai-test thieu tham so bat buoc:%b\n\nBo sung flag, vi du:\n   Dung skill ai-test de chay pipeline cho: \"mo ta test\" --project=demo\nHoac dung skill ai-test-i de nhap tuong tac.' "$problems")"

jq -nc --arg r "$reason" '{decision:"block", reason:$r}'
exit 0
