### Task 5: Correct the enforcement claim in the prompts

**Invariant.** No document or prompt claims an enforcement property the mechanism does not deliver.

**Status.** The spec half is **done** — see *Threat model*, the revised *The hook and the audit are not redundant*, and *Handover artifact*. What remains is the agent prompts.

Nothing in them anticipates the **rationalisation route**: Red genuinely needs the public API signature, `Read` is denied, and "let me print it from a scratch test" is exactly the shape a capable model produces when blocked — helpful, goal-directed, and fatal to the guarantee. Both directions were reproduced with zero guard denials. Red's and Green's prompts must name that route and forbid it, because it is the one crossing the guard cannot catch.

**Done when.** `git show --stat` names files under `agents/`, and no file in the repository contains "sole enforcement".

