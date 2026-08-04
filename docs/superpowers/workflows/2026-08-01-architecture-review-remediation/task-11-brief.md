### Task 11: `README.md` and packaging

**Invariant.** An installing user has entry documentation, and it states the Node requirement.

Cover what the plugin guarantees, what it explicitly does not (link the threat model), the Node 22 requirement, `/tdd-init` then `/tdd`, the config schema, and the degradation table.

Two packaging defects belong here. `source: "./"` ships the whole repository — `docs/`, `.superpowers/`, `tests/`, `e2e/`, `.idea/`; the ledger records this fixed, but it was fixed by *documenting* it. And `version` is duplicated across `plugin.json` and `marketplace.json` with nothing keeping them in sync, while `config.version` is written by `/tdd-init` and read by nothing.

**Done when.** `README.md` exists and `git show --stat` names it.

---

## Tier 3

