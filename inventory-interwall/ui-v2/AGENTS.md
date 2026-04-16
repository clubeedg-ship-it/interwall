# UI-V2 Agent Guide

This directory is the frontend lane for Interwall.

## Read order

1. `/Users/ottogen/interwall/AGENTS.md`
2. `/Users/ottogen/interwall/.project/SESSION.md`
3. `/Users/ottogen/interwall/.project/RETRIEVAL.md`
4. the `Frontend lane` section in `/Users/ottogen/interwall/.project/WORKSTREAMS.md`
5. this file
6. `CLAUDE.md` in this directory

## Local rules

- Keep implementation strictly inside `ui-v2/` unless the task explicitly requires a backend contract change
- `ui-v2` is a rebuild, not a redesign
- Preserve Interwall’s operator-console identity
- Only one modal exists in the rebuild: the Build workspace
- Read the matching legacy file and backend router before wiring
- If the backend contract is missing, report the exact missing field or endpoint instead of mocking it

## Completion standard

- behavior matches the legacy workflow or the current backend contract
- no hardcoded domain data
- responsive layout works
- browser verification is done, not just static rendering
