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
assert_contains "version" "$_init_text" "the Step 7 JSON block was located at all"
for _k in version crapMode complexity mutation \
          maxCrap duplicateThreshold maxFunctionLines \
          greenAttempts violationRetries mutationRounds mutantsPerPass \
          greenMaxNewUncovered refactorMaxNewUncovered ignore; do
  assert_contains "$_k" "$_init_text" "tdd-init's config template names ${_k}"
done

# The three glob lists must be arrays. A bare string would word-split in the
# guard into per-character globs and match almost nothing -- denying every
# write and, worse, permitting every read.
for _k in test source ignore; do
  assert_eq "array" "$(jq -r ".globs.${_k} | type" "$_cfg")" \
    "globs.${_k} is an array"
done
