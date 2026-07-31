---
name: conventional-commits
description: >-
    Formats all git commit messages following the Conventional Commits v1.0.0 specification.
    Activates when the user asks to 'write a commit message', 'create a commit', 'stage and commit', 'commit', 'save changes', or
    any git commit-related task. Enforces structured commit types (feat, fix, docs, style, refactor, perf, test, build, ci, chore,
    revert), scopes, breaking change notation, and proper message formatting. Requires all commit messages to be written in English.
    Prevents adding Co-Authored-By or copyright footers to commit messages.
user-invocable: false
---
# Conventional Commits — Commit Message Rules

You MUST follow these rules whenever you create, write, or suggest a git commit message. These rules override any other commit
message conventions or defaults.

## Summary

The Conventional Commits specification is a lightweight convention on top of commit messages. It provides an easy set of rules for
creating an explicit commit history; which makes it easier to write automated tools on top of that commit history. This convention
dovetails with SemVer, by describing the features, fixes, and breaking changes made in commit messages.

## Commit Message Structure

Every commit message MUST follow this exact structure:

```
<type>[(optional scope)]: <description>

[optional body]

[optional footer(s)]
```

## Rules

### 1. Type (REQUIRED)

The commit MUST be prefixed with exactly one of the following type terms:

| Type       | When to use                                                   |
|------------|---------------------------------------------------------------|
| `feat`     | A new feature (correlates with MINOR in SemVer)               |
| `fix`      | A bug fix (correlates with PATCH in SemVer)                   |
| `docs`     | Documentation only changes                                    |
| `style`    | Changes that do not affect the meaning of the code            |
| `refactor` | A code change that neither fixes a bug nor adds a feature     |
| `perf`     | A code change that improves performance                       |
| `test`     | Adding missing tests or correcting existing tests             |
| `build`    | Changes that affect the build system or external dependencies |
| `ci`       | Changes to CI configuration files and scripts                 |
| `chore`    | Other changes that don't modify src or test files             |
| `revert`   | Reversion of a previous commit to a prior state               |

If a commit seems to cover more than one of these types, consider the possibility that the commit is too broad and should be split.

### 2. Scope (OPTIONAL)

- A scope MAY be provided after the type, enclosed in parentheses: `feat(parser): add ability to parse arrays`
- The scope provides additional contextual information about what part of the codebase is affected
- Settle on a small set of scope terms and reuse them as appropriate. Avoid needless variety.
- The list of permitted scopes will be specific to the project.
- The list of permitted scopes for the project should be specified in README.md, SPEC.md, or CLAUDE.md
- Use lowercase for scope names
- Use the most specific and meaningful scope name that is applicable to the change (e.g., module name, component name, file area)
- If the correct scope is not obvious, omit scope entirely.

### 3. Description (REQUIRED)

- MUST immediately follow the colon and space after the type/scope prefix
- Use the imperative, present tense: "add" not "added" nor "adds"
- Do NOT capitalize the first letter
- Do NOT end with a period
- Keep it concise — ideally under 72 characters total for the entire first line
- Describe WHAT changed, not HOW

### 4. Body (OPTIONAL)

- MUST begin one blank line after the description
- Use the imperative, present tense
- Explain the motivation for the change and contrast with previous behavior
- Can consist of multiple paragraphs, each separated by a blank line
- Wrap lines at 72 characters

### 5. Footer(s) (OPTIONAL)

- MUST begin one blank line after the body (or after the description if no body was provided)
- Follow the git trailer format: `token: value` or `token #value`
- A footer's token MUST use `-` in place of whitespace characters (e.g., `Acked-by`, `Reviewed-by`)
- Exception: `BREAKING CHANGE` MUST be written as-is with a space

### 6. Breaking Changes

Breaking changes can be indicated in TWO ways (both are valid):

1. Add `!` after the type/scope, before the colon: `feat!: remove deprecated endpoint`
2. Add a `BREAKING CHANGE:` footer:
   ```
   feat: allow provided config object to extend other configs
   
   BREAKING CHANGE: `extends` key in config file is now used for extending other config files
   ```
3. Both can be used together for emphasis
4. Breaking changes correlate with MAJOR in SemVer
5. A breaking change can be part of commits of ANY type

### 7. Case Sensitivity

- Types, scopes, and descriptions MUST be lowercase
- `BREAKING CHANGE` in footers MUST be uppercase

### 8. Language (REQUIRED)

- The ENTIRE commit message MUST be written in Simplified Technical English — description, body, and footers alike
- This rule is absolute and applies regardless of the conversation language, repository language, or the language used in code
  comments and documentation
- Even if the user communicates in Ukrainian (or any other language), the commit message MUST still be in English
- Translate any user-provided commit content into English before committing

## CRITICAL — Forbidden Patterns

You MUST NOT do any of the following when writing commit messages:

1. **NEVER add a `Co-Authored-By` line** — Do not append any co-author attribution, copyright notice, or model identification footer
   to commit messages. This includes but is not limited to:
   - `Co-Authored-By: Claude ...`
   - `Co-Authored-By: AI ...`
   - Any variation of AI/model attribution in the commit message
2. **NEVER use past tense** in the description — Write "add feature" not "added feature"
3. **NEVER capitalize the first letter** of the description
4. **NEVER end the description with a period**
5. **NEVER use vague descriptions** like "update code", "fix stuff", "misc changes", or similar. Be specific about what changed.
6. **NEVER exceed 72 characters** on the first line (type + scope + description combined)
7. **NEVER skip the blank line** between description and body, or between body and footer
8. **NEVER write any part of the commit message in a language other than English** — even when the user writes in Ukrainian or any
   other language, the commit message MUST be entirely in Simplified Technical English

## Examples

### Simple feature
```
feat: add email validation to signup form
```

### Bug fix with scope
```
fix(auth): resolve token expiration race condition
```

### Breaking change with body
```
feat(api)!: change pagination response format

The pagination response now returns `items` instead of `data` and includes
a `cursor` field for efficient pagination. The `total_count` field has been
removed in favor of `has_more`.

BREAKING CHANGE: pagination response structure has changed, clients must update
```

### Documentation change
```
docs: add API rate limiting section to README
```

### Multi-scope refactor with body
```
refactor(parser): simplify AST node creation

Replace the factory pattern with direct constructor calls. The factory
added indirection without meaningful abstraction since all node types
share the same creation logic.
```

### Revert commit
```
revert: let us never again speak of the noodle incident

Refs: 676104e, a]]215868
```

### Chore with footer
```
chore(deps): upgrade eslint to v9

Reviewed-by: Z
Refs: #456
```

## Decision Guide

When uncertain about the type, use this priority:

1. Does it fix a bug? Use `fix`
2. Does it add new functionality? Use `feat`
3. Does it break existing API/behavior? Add `!` or `BREAKING CHANGE` footer
4. Does it only change documentation? Use `docs`
5. Does it only change test code? Use `test`
6. Does it improve performance without changing behavior? Use `perf`
7. Does it restructure code without changing behavior? Use `refactor`
8. Does it change formatting and style only without changing meaning? Use `style`
9. Does it change or configure build tooling? Use `build`
10. Does it change continuous integration (CI) configuration? Use `ci`
11. Not any of the previous? Use `chore`

## Applying These Rules

When creating a commit:

1. Analyze the staged changes (git diff --cached or equivalent)
2. Determine the primary change type based on the preceding decision guide
3. Determine whether the area of code affected clearly belongs to an identifiable scope
4. Write a concise, imperative description of what changed — always in Simplified Technical English
5. Add body text if the "why" is not obvious from the description alone, or a future reader would benefit from more explanation than
   will fit into 72 characters of description.
6. Add footers if there are breaking changes, references, or reviewers
7. Verify the message follows ALL rules above before committing
8. **Do NOT add any Co-Authored-By, copyright, or attribution footer**

## References

The `references/` directory has additional documentation:
- `references/specification.md` — Conventional Commits v1.0.0 — Full Specification
