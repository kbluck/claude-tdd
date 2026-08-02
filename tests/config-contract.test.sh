# Sourced by tests/run.sh. Do not add a shebang, set -e, or exit.
#
# Pins the .tdd/config.json schema that /tdd-init must produce and that
# guard.sh and the orchestrator consume. Update this list when the schema
# changes -- deliberately, not by discovering a null at runtime.

_cfg="$REPO_ROOT/tests/fixtures/config.json"

# Keys that must be present AND non-null.
for _k in version crapMode \
          commands.test commands.single \
          globs.test globs.source globs.ignore \
          refactorTriggers.maxCrap refactorTriggers.duplicateThreshold \
          refactorTriggers.maxFunctionLines \
          limits.greenAttempts limits.violationRetries \
          limits.mutationRounds limits.mutantsPerPass \
          coverageGates.greenMaxNewUncovered coverageGates.refactorMaxNewUncovered; do
  assert_eq "yes" "$(jq -r "if (.${_k} // null) == null then \"no\" else \"yes\" end" "$_cfg")" \
    "config has non-null ${_k}"
done

# Keys that must be PRESENT but may be null -- absence and null mean different
# things here. Null is "this toolchain has no such tool, degrade explicitly";
# absent means /tdd-init forgot to decide.
for _k in coverage complexity mutation; do
  assert_eq "true" "$(jq -r ".commands | has(\"${_k}\")" "$_cfg")" \
    "config declares commands.${_k} (null is allowed, absent is not)"
done

# The template inside commands/tdd-init.md is a SECOND copy of this schema, and
# two copies drift. It already did once: the template omitted crapMode,
# maxCrap, mutationRounds, mutantsPerPass, commands.complexity and
# commands.mutation, so an agent following it would have written a config whose
# primary refactor trigger threshold was null -- a comparison that never fires.
# Scope the haystack to the Step 7 JSON block, NOT the whole file. Seven of
# these key names also appear in surrounding prose (the detection table, the
# degradation table), so a whole-file grep passes even when the key is missing
# from the template a model actually copies from. Verified: deleting crapMode
# from the JSON block alone left the suite fully green under a whole-file
# match. That is the same defect this test exists to catch, one level up.
_init="$REPO_ROOT/commands/tdd-init.md"
_init_text=$(sed -n '/^## 7\. Write the files/,/^Append to/p' "$_init")

# Both anchors have to be checked, and they fail differently.
#
# Start anchor broken -> sed returns empty -> every assertion below fails in a
# heap, which is loud but confusing. The first assertion names the real cause.
#
# End anchor broken -> sed runs to EOF instead, silently re-widening the
# haystack toward the whole-file behaviour this scoping was added to remove.
# That one passes quietly, so it needs its own check: nothing from step 8
# onward may appear in the extracted block.
assert_contains "version" "$_init_text" "the Step 7 JSON block was located at all"
case "$_init_text" in
  *"## 8"*) _bounded=no ;;
  *)        _bounded=yes ;;
esac
assert_eq "yes" "$_bounded" "the extracted block stops before step 8 (end anchor still matches)"
# DERIVE the expected keys from the fixture instead of hand-maintaining a
# second list. The previous hardcoded list was a strict SUBSET of the keys the
# fixture-side loop requires -- commands.test, commands.single,
# commands.coverage, globs.test and globs.source were never pinned on the
# template side at all, and both loops were green throughout. Renaming
# `"coverage":` in the template left the suite fully passing, and that is the
# key whose loss cascades into all three coverage gates.
#
# Two hand-maintained lists of the same thing drift. One derived from the other
# cannot.
#
# Multiplicity matters: "test" occurs twice (commands.test and globs.test), so
# a presence check would not prove both are declared.
# Count the iterations. A derived loop that enumerates nothing -- a broken jq
# filter, an unreadable fixture -- contributes zero assertions and the suite
# stays green while the check has silently disappeared. Verified: typing
# `strnig` for `string` in this filter dropped 46 assertions and the run
# reported 122 passed, 0 failed.
_tpl_seen=0
for _k in $(jq -r 'paths | .[-1] | select(type=="string")' "$_cfg" | sort -u); do
  _want=$(jq -r --arg k "$_k" '[paths | .[-1] | select(. == $k)] | length' "$_cfg")
  _have=$(printf '%s' "$_init_text" | grep -o "\"${_k}\":" | wc -l | tr -d ' ')
  assert_eq "$_want" "$_have" "tdd-init's template declares ${_k} (${_want}x)"
  _tpl_seen=$((_tpl_seen + 1))
done
# Floor, not an exact count: the fixture currently has 23 distinct key names,
# and a floor of 19 leaves room for the schema to shrink legitimately while
# still catching collapse. Do NOT derive the expected count from the same jq
# filter the loop uses -- one broken filter would then corrupt both sides of
# the comparison identically and the check would pass.
assert_eq "yes" "$([ "$_tpl_seen" -ge 19 ] && echo yes || echo no)" \
  "the derived template loop enumerated at least 19 keys (saw ${_tpl_seen})"

# The spec holds a THIRD copy of this schema. Drift there misleads whoever
# reads the design next, which is how the template drifted in the first place.
_spec="$REPO_ROOT/docs/superpowers/specs/2026-07-30-tdd-subagent-workflow-design.md"
_spec_text=$(sed -n '/"version": 1,/,/^}/p' "$_spec")
assert_contains "crapMode" "$_spec_text" "the spec's schema block was located at all"
# Same end-anchor hazard the template block has: if `^}` stops matching, sed
# runs to EOF and silently sweeps in trailing prose, widening the haystack and
# corrupting the counts. Asserting the last line IS the closing brace is
# stronger than a content marker, because it does not depend on what happens to
# follow the block.
assert_eq "}" "$(printf '%s' "$_spec_text" | tail -1)" \
  "the spec's schema block ends at its closing brace (end anchor still matches)"
_spec_seen=0
for _k in $(jq -r 'paths | .[-1] | select(type=="string")' "$_cfg" | sort -u); do
  _want=$(jq -r --arg k "$_k" '[paths | .[-1] | select(. == $k)] | length' "$_cfg")
  _have=$(printf '%s' "$_spec_text" | grep -o "\"${_k}\":" | wc -l | tr -d ' ')
  assert_eq "$_want" "$_have" "the spec's schema declares ${_k} (${_want}x)"
  _spec_seen=$((_spec_seen + 1))
done
assert_eq "yes" "$([ "$_spec_seen" -ge 19 ] && echo yes || echo no)" \
  "the derived spec loop enumerated at least 19 keys (saw ${_spec_seen})"

# The three glob lists must be arrays. A bare string would word-split in the
# guard into per-character globs and match almost nothing -- denying every
# write and, worse, permitting every read.
for _k in test source ignore; do
  assert_eq "array" "$(jq -r ".globs.${_k} | type" "$_cfg")" \
    "globs.${_k} is an array"
done
