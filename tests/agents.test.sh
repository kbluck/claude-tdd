# Sourced by tests/run.sh. Do not add a shebang, set -e, or exit.
#
# The guard identifies callers by agent_type, which is the agent file's `name:`
# field. If the two ever disagree, the guard stops constraining that role and
# says nothing. This test is the only thing standing between a rename and a
# silently disabled guard.

_agent_dir="$REPO_ROOT/agents"
_guard="$REPO_ROOT/hooks/guard.sh"

for _f in "$_agent_dir"/*.md; do
  [ -e "$_f" ] || continue
  _name=$(sed -n 's/^name:[[:space:]]*//p' "$_f" | head -1)
  assert_contains "$_name)" "$(cat "$_guard")" \
    "$(basename "$_f") declares name '$_name', which guard.sh dispatches on"
done

# And the reverse: every role the guard knows about must have an agent file.
for _role in tdd-red tdd-green tdd-refactor tdd-mutate; do
  _found=no
  for _f in "$_agent_dir"/*.md; do
    [ -e "$_f" ] || continue
    [ "$(sed -n 's/^name:[[:space:]]*//p' "$_f" | head -1)" = "$_role" ] && _found=yes
  done
  assert_eq "yes" "$_found" "guard role $_role has an agent definition"
done
