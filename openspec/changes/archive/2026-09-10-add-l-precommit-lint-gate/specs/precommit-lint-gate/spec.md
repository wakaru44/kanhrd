## Purpose

A commit-time pre-commit hook gate enforcing formatting and YAML/JSON/
Markdown validity, scoped away from paths owned by concurrent in-flight
lanes, with a forward-compatible placeholder for an Angular lint script.

## ADDED Requirements

### Requirement: Hooks catch formatting and validity issues before commit
`pre-commit` SHALL run trailing-whitespace, end-of-file, line-ending,
YAML/JSON validity, Prettier formatting, and Markdown lint checks on every
commit within its configured scope, blocking the commit when a check
fails and cannot be auto-fixed.

#### Scenario: Invalid YAML is caught before commit
- **WHEN** a developer stages a YAML file with a syntax error inside the hook's scope
- **THEN** `pre-commit` blocks the commit with a `check-yaml` failure

### Requirement: Hook scope excludes paths owned by concurrent in-flight lanes
The hook configuration SHALL exclude any path explicitly called out as
owned by other in-flight work at the time the gate was introduced, so an
auto-fixing hook cannot produce a file conflict with concurrent changes to
those paths. Widening the scope is a deliberate, documented follow-up, not
a silent default.

#### Scenario: A file under an excluded path is not touched by the hooks
- **WHEN** a developer commits a change under `apps/web/`
- **THEN** none of the configured hooks run against that file

### Requirement: Missing Angular lint script degrades to a no-op, not a failure
The `web-lint` hook SHALL run `apps/web`'s `lint` script only if one is
declared, and SHALL be a no-op when it is not, so commits are not blocked
by a script that doesn't exist yet.

#### Scenario: Commit succeeds before apps/web has a lint script
- **WHEN** `apps/web/package.json` declares no `lint` script
- **THEN** the `web-lint` hook exits successfully without running anything
