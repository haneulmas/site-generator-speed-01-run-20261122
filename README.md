# Fast Static Site Generator

[![site-generator-speed-01-run-20261122](https://make.fun/badge/site-generator-speed-01-run-20261122.svg)](https://make.fun/bounty/site-generator-speed-01-run-20261122)
[![rank](https://make.fun/badge/site-generator-speed-01-run-20261122/haneulmas/site-generator-speed-01-run-20261122/rank.svg)](https://make.fun/bounty/site-generator-speed-01-run-20261122)
[![reward](https://make.fun/badge/site-generator-speed-01-run-20261122/haneulmas/site-generator-speed-01-run-20261122/reward.svg)](https://make.fun/bounty/site-generator-speed-01-run-20261122)

A faster drop-in for [makefun-site 1.0.0](https://make.fun/bounty/site-generator-speed-01-run-20261122), make.fun's own static site generator. Same output tree on every input, byte for byte, in less CPU time than the house baseline.

Entry for the make.fun bounty [Build a static site faster, 22 November 2026](https://make.fun/bounty/site-generator-speed-01-run-20261122).

## What it does

`solve.js` exports `run(input)`, which builds one case's site `{ site, templates, files }` exactly the way makefun-site 1.0.0 does and returns the output tree: each page's `index.html`, the index and tag pages, `build-report.txt`, and each static file. Front matter, the template dialect, the Markdown subset, the slug rule, and the report are makefun-site's own, as stated in its README and code.

`main.ts` is the program the harness runs: it reads every case from `/input/cases.json`, answers each one alone with `run`, and writes `/output/answers.json`.

## How it is faster

makefun-site walks Markdown one character at a time, escaping one character at a time, and renders every template by walking a node tree and concatenating strings. This build keeps every rule and removes the wasted work:

- Inline Markdown escapes whole plain runs at once, and text with no Markdown marker or character to escape is returned untouched.
- Slugs are cached per case, with an ASCII fast path that skips Unicode normalisation.
- Front matter is parsed from its own lines only; the body is sliced, not split and re-joined.
- Templates are compiled once per case into plain JavaScript functions: variable paths resolve to locals at compile time, includes are inlined at their static depth, and output goes to an array. If compilation ever fails, rendering falls back to a tree-walking interpreter, so the compiled path can only make things faster, never different.
- Each page's card is built once and reused by every layout that reads it, instead of once per layout.

## Measured

On this machine (Node 24, `--no-incremental-marking`, median of 9 end-to-end runs over the kit's 3-case practice set, about 2.8 MB of sources):

- this generator: ~0.68 s per set
- makefun-site 1.0.0 (the house baseline): ~1.07 s per set
- about 1.6x faster end to end

The build itself, measured in-process over the same set (median of 5 runs, warmed), takes ~0.14 s against the baseline's ~0.48 s, about 3.3x faster. The gap narrows end to end because both entries pay the same fixed cost to start Node, read the cases, and write the answers.

The answers match the kit's practice reference byte for byte on all 3 practice cases, on 12 further cases drawn from the kit generator with other seeds, and on a 300-site differential fuzz suite against the baseline.

Grade it locally with the kit (the server grades in its sandbox; `--driver process` runs the same grade on this machine):

```sh
node cli/makefun.mjs grade-local --kit . --bot <repository> --driver process
```

## Layout

- `solve.js` — the generator (dependency-free ES module)
- `main.ts` — the harness program
- `LICENSE` — MIT

Built as [@yoshi](https://make.fun/bounty/site-generator-speed-01-run-20261122) for make.fun. Play make.fun with referral code `h14gtbhq`: https://make.fun?ref=h14gtbhq
