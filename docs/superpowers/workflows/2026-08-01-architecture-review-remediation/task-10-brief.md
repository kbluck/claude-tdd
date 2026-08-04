### Task 10: Config-committed contradiction and the missing-config test

**Invariant.** Every claim about `.tdd/config.json`'s tracked status agrees, and the guard's missing-config behaviour is asserted rather than described.

**Status.** The spec and `AGENTS.md` halves are **done**. The spec now states that target projects commit the config, and that this repository gitignores its own because that config describes the `e2e/` fixture.

**What remains.** `/tdd-init` verifies `git ls-files .tdd/config.json` is non-empty after committing — `git add` on an ignored path is a silent no-op without `-f`, which would break the first-run path that step exists to protect. And the suite gains a missing-config assertion: point the guard at an empty sandbox and assert exit 2 with the setup message.

**Why the test matters more than the correction.** A safety property verified by *the repository's own incidental state* drifts silently, because nothing runs when it changes.

**Done when.** `git show --stat` names a test file and `commands/tdd-init.md`.

