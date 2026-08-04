### Task 3: Port the guard and the decision rules to Node

**Invariant.** The guard produces the same verdict as the bash implementation for every case the bash implementation got right, and the correct verdict for every case it got wrong.

**Scope.** `hooks/guard.sh` + `hooks/lib/rules.sh` (321 lines) become `hooks/guard.mjs` + `hooks/lib/rules.mjs`. `hooks/hooks.json` moves to exec form. `jq` disappears — 11 call sites, JSON is native.

**What the port dissolves.** These are not fixed; they cannot occur:

- the `set -f` glob-expansion fail-open, where an unquoted glob string expanded against the filesystem and made the verdict depend on the working directory;
- the `${p//\/\//\/}` replacement-half trap, which silently emitted `e2e\/src/a.py` and bit twice;
- an empty static prefix making `case "$cmd" in *)` match every command;
- unset positionals aborting the whole script under `set -u`.

**The path layer, which is the security-critical part.** Four rules, each with a failure mode named in the spec:

1. **Canonicalise with `fs.realpathSync.native`**, which resolves symlinks and returns the filesystem's stored spelling — closing the case bypass and the symlink residual together, with no case-detection probe.
2. **Resolve the nearest existing ancestor, then re-append the tail.** `realpath` throws `ENOENT` on a path that does not exist, and every `Write` of a new test has a non-existent leaf. Resolving only the parent rejects a legitimate write into a new subdirectory.
3. **Convert separators to `/` before any comparison**, on both root and target. Globs are a POSIX-spelled dialect. Do not reach for the ambient `path` module to do it.
4. **Fold case asymmetrically.** A read matches the denylist against the resolved path *or* its case-folded form and either match denies; a write matches the allowlist on the resolved path only. Folding a write comparison permits more, not less.

**Own the glob matcher.** `*` matches within one segment, `**` crosses `/`, and **a leading `**/` matches at zero depth** — the S3 defect, where `**/test_*.py` missed a root-level `test_foo.py` and `**/*_test.go` missed an idiomatic Go `main_test.go`, so Green could read them.

**Constraints.** Wrap the entire body so that any thrown error becomes a deliberate exit 2 — an uncaught exception exits 1, which permits. Do not call `process.exit()` in the same tick as a stdout write; the write can truncate. `realpath` failures deny.

**Check `process.versions.node` first, before anything else can throw**, and deny below the floor. This is the only mechanism that enforces the version requirement, because nothing in the project selects the hook's interpreter — measured divergence: a bundled 24.13.0 for the hook against 22.23.2 for the `Bash` tool. A guard that instead discovers the problem by calling a missing API crashes, exits non-2, and permits.

This task also adds the `package.json` and `tsconfig.json` the type checking needs — `devDependencies` only, `noEmit`, `allowJs` and `checkJs`, with `@types/node` on the 22 line. **Typing the config does not replace validating it**: every degenerate shape in Task 2 must still fail closed at runtime, because the guard parses untrusted JSON and a `@typedef` guarantees nothing about what is on disk.

**Done when.** Task 2's matrix passes in full; the review's Appendix A probes return DENIED on all six read rows; `git show --stat` names `hooks/guard.mjs`, `hooks/lib/rules.mjs` and `hooks/hooks.json`; and the bash files are deleted in the same commit.

