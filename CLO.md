# Building ocamlearlybird with the dk build tool

This document explains how to build the `ocamlearlybird` OCaml debug adapter
with [dk](https://diskuv.com/dk), a Windows-friendly, incremental, remote
cacheable build system. It is
written for two audiences, people who just want the binary (**Users**) and
people who maintain this repository's dk integration (**Maintainers**), and it
is meant to double as a worked, replayable example of adopting dk for an
existing opam/dune project.

Timings come from GitHub Actions runners running dk 2.4.2.342
(`.github/workflows/measure-performance.yml`). Every figure below is the mean of
**four** runs of that workflow at one pin, and the `±` beside it is how far those
four runs spread: the sample standard deviation over the mean, rounded to a whole
percent. A figure at `±2%` repeated itself and a figure at `±17%` did not. Four
runs separate a steady number from a noisy one; they are not enough to pin the
`±` itself finer than a whole percent. Absolute times scale with core count and
disk speed, so your own machine will land somewhere else.

> **Two launchers, one tool.** dk ships two front-ends: `dk0` (single-threaded,
> minimal) and `dk1` (multi-threaded, the everyday driver). This project vendors
> both launcher scripts at the repo root, so after cloning you can run `./dk1`
> directly with no prior install, the launcher self-installs the pinned version
> recorded in `dk.u`. All commands below use `dk1`.

---

## Quick Setup

The Quick Setup path builds ocamlearlybird from source **once on your machine**,
on top of a prebuilt toolchain: the OCaml compiler, Dune, opam, and the
supporting build utilities arrive as **prebuilt, cryptographically attested,
content-addressed objects** that dk lazily range-fetches from published Diskuv
package releases. An existing CI-backed dk package (here
`dkpkg/CommonsLang_OCaml`, which publishes the OCaml toolchain objects) gives
you that **partial caching** for free.

What you build locally in Quick Setup is ocamlearlybird's own opam dependency
closure (lwt, dap, menhir, ppxlib, …) plus ocamlearlybird itself, each as its
own cached dk object.

### Quick Setup for Users

You need two things: install dk1, then run one object.

**1. Install dk1** (installs both `dk0` and `dk1` into `~/.local/bin`, verified
with signify + SHA-256):

```sh
curl -fsSL https://diskuv.com/dk/install.sh | sh
# Windows PowerShell:  irm https://diskuv.com/dk/install.ps1 | iex
```

(If you cloned this repository you can skip the install entirely and use the
vendored `./dk1` launcher, which self-installs the pinned version on first run.)

**2. Build and run the debug adapter** as a single content-addressed object:

```sh
./dk1 run-object NotHackwaly_Ocamlearlybird.Ocamlearlybird@1.3.6 \
  -s Release.Linux_x86_64 \
  -m bin/ocamlearlybird.exe \
  -- --help=plain
```

- `-s Release.Linux_x86_64` selects the ABI slot (swap for `Release.Darwin_arm64`
  etc. on other hosts).
- `-m bin/ocamlearlybird.exe` selects the member of the built object to execute.
- everything after `--` is passed to the debug adapter.

The first run fetches the prebuilt toolchain, builds the locked dependency
closure and the `earlybird` package, and runs the result. Subsequent runs are
served from the local object cache:

| Step | Linux_x86_64 | Windows_x86_64 |
| --- | --- | --- |
| Install dk1 | ~5 s | ~5 s |
| First run (fetch toolchain + build closure) | ~3 m 42 s ±8% | ~9 m 30 s ±12% |
| Warm re-run | ~6 s ±2% | ~12 s ±16% |

Every figure is the mean of **four** runs of
`.github/workflows/measure-performance.yml` at one pin, and `±` is how far those
four spread: the sample standard deviation over the mean, rounded to a whole
percent. The install row is a single observation
the workflow does not time.

### Compared with a conventional opam + dune setup

Building the same binary the conventional way (`opam switch create`,
`opam install . --deps-only`, `dune build`) reaches a runnable binary more
slowly but then keeps a much faster inner loop. Measured on the same runners
with dk 2.4.2.342 and opam 2.5.2 (the `opam` figures include the switch create
and compiler install):

| Step | dk Quick Setup | opam + dune |
| --- | --- | --- |
| Linux: fresh checkout to a runnable binary | ~3 m 42 s ±8% | ~2 m 13 s ±7% |
| Linux: re-run the built binary | ~6 s ±2% | ~0.1 s ±8% |
| Linux: edit one file, rebuild | ~18 s ±3% | ~0.2 s ±7% |
| Windows: fresh checkout to a runnable binary | ~9 m 30 s ±12% | ~7 m 20 s ±4% |
| Windows: re-run the built binary | ~12 s ±16% | ~1.2 s ±18% |
| Windows: edit one file, rebuild | ~46 s ±7% | ~1.4 s ±15% |

The dk figures are the mean of **four** runs of
`.github/workflows/measure-performance.yml` at one pin. For `opam + dune` the two
fresh-checkout figures are the mean of the **19** (Linux) and **20** (Windows)
runs at that same pin whose `setup-ocaml` step restored its switch from the
Actions cache, read from each run's log rather than guessed from its duration;
the other four `opam + dune` rows are pooled over all **31** (Linux) and **32**
(Windows) runs, because the cache does not touch them. `±` is the sample standard
deviation over the mean, rounded to a whole percent.

**The `opam + dune` column describes a warm CI cache, and that is worth stating in
numbers rather than as a caveat.** `setup-ocaml` restores a 195 MB (Linux) or
552 MB (Windows) opam switch, and that restore sits inside the fresh-checkout
figure. Measured with the cache turned off, over 8 runs at the same pin, the same
column reads **~4 m 45 s ±13%** on Linux and **~15 m 6 s ±2%** on Windows, and dk
arrives first on both. The cache holds the compiler and the switch, not this
project's dependencies: `opam install . --deps-only` costs ~1 m 38 s with the cache
off against ~1 m 44 s with it on, which is the same number twice.

dk has no step whose cost turns on a cache hit: it fetches the prebuilt, attested
toolchain every time. Once built, dune's persistent `_build` gives a sub-second
inner loop, so a developer iterating on source is fastest under `dune build -w`
against a switch that reuses dk's already-built dependency closure.

### Quick Setup for Maintainers

Adopting dk for an existing opam/dune project is the command sequence below,
shown for Linux. On macOS swap the slot in step 6 (`Release.Darwin_arm64`); on
Windows use PowerShell, `irm https://diskuv.com/dk/vendor.ps1 | iex` for step 1,
and `.\dk1.cmd` for the rest.

```sh
# 1. vendor the dk0/dk1 launchers into the repo
curl -fsSL https://diskuv.com/dk/vendor.sh | sh
# 2. scaffold dk.u, seed the pin table and .gitattributes, record the recipe's
#    declared trust statements, and import the toolchain
./dk1 quickstart ocaml opam414
# 3. fetch and verify the toolchain import
./dk1 update
# 4. adopt: solve the lock, generate the build forms, register the assets
./dk1 dialog CommonsLang_OCaml.Dk.OpamLock.Adopt@1.1.14 version=1.3.6 unit=Ocamlearlybird ns=NotHackwaly_Ocamlearlybird
# 5. recompute the checksums of the registered workspace assets
./dk1 update
# 6. build and run the debug adapter
./dk1 run-object NotHackwaly_Ocamlearlybird.Ocamlearlybird@1.3.6 \
  -s Release.Linux_x86_64 -m ./bin/ocamlearlybird.exe -- --help=plain
```

`ns=` keeps this fork's committed third-party namespace; a maintainer adopting
their own project omits it and gets a namespace derived from the repository.

The first adoption of this repository hand-authored the values files,
hand-registered every asset, hand-edited `.gitignore`, and ran a chain of
generator dialogs with redundant arguments. The reduced flow generates all of
it. What the flow produces (all committed):

| File | Role |
|---|---|
| `dk0`, `dk1`, `dk0.cmd`, `dk1.cmd` | vendored self-installing launchers (step 1) |
| `etc/dk/t/acceptances.json`, `etc/dk/t/capabilities.json` | trust records from the recipe's declared trust statements (step 2) |
| `dk.u` | workspace script: pinned imports + registered asset declarations (steps 2, 4, 5) |
| `dk-opam-pins.txt` | opam solve pin table, seeded by the quickstart (see below) |
| `dk-src/dune-workspace` | dune workspace root marker staged into the assembled source |
| `dk.opam-lock.jsonc` | the solved, checked-in per-slot dependency lock (step 4) |
| `etc/dk/v/…/Ocamlearlybird.Src.values.jsonc` | generated localized-source form (step 4) |
| `etc/dk/v/…/Ocamlearlybird.Closure.values.jsonc` | generated one-line closure driver (step 4) |
| `etc/dk/v/…/Ocamlearlybird.values.jsonc` | generated thin final form exposing `bin/ocamlearlybird` (step 4) |
| `etc/dk/i/*.values.json`, `etc/dk/i/dk-closure-manifest.tsv` | verified import records (steps 2, 3) |

**Maintenance after adoption.** After a repin or a dependency change, the
zero-argument `Refresh` regenerates the committed driver from the stamped
parameters, and `mode=check` validates it read-only (CI-friendly):

```sh
./dk1 dialog CommonsLang_OCaml.Dk.OpamLock.Refresh@1.1.14               # regenerate the driver
./dk1 dialog CommonsLang_OCaml.Dk.OpamLock.Refresh@1.1.14 mode=solve    # re-solve the lock, then the driver
./dk1 dialog CommonsLang_OCaml.Dk.OpamLock.Refresh@1.1.14 mode=check    # read-only; nonzero if a driver is stale
./dk1 dialog CommonsLang_OCaml.Dk.OpamLock.Refresh@1.1.14 version=1.3.7 # bump earlybird across the coupled ids
```

After editing any workspace asset (`dune`, `dune-project`, `earlybird.opam`,
`src/`, or the lock) run `./dk1 update --no-imports` to refresh the recorded
checksums in `dk.u`, then rebuild, see *Editing a file and rebuilding*.

#### The pin table (`dk-opam-pins.txt`)

The quickstart seeds the pin table, and the
[dk for opam users guide](https://diskuv.com/dk/docs/OPAM/) explains its line
forms and purpose. This repository makes one change to the seeded table: the
`repo default` line pins the opam-repository to a single commit,

```
repo default git+https://github.com/ocaml/opam-repository.git#4f41495f12b15921ce982ac208c41b257d295515
```

so every maintainer and every CI run solves against the same package index and
produces the same lock. Bump the commit deliberately, then re-solve with
`Refresh mode=solve`.

---

<!-- The "## High Performance" section is added on the dk1-high-performance branch (PR 2). -->

## Editing a file and rebuilding

The supported flow after editing a source file:

```sh
# edit e.g. src/main/main.ml, then:
./dk1 update --no-imports          # recompute workspace-asset checksums in dk.u
./dk1 run-object NotHackwaly_Ocamlearlybird.Ocamlearlybird@1.3.6 \
  -s Release.Linux_x86_64 -m bin/ocamlearlybird.exe -- --help=plain
```

dk0/dk1 re-checksum workspace assets **only on `update`**, so `dk1 update` is what
turns a working-tree edit into a new content hash. Because the object graph is
content-addressed, only the objects whose inputs actually changed rebuild, here
the localized-source object and the local `earlybird` package object, while every
external package object stays cached and is reused untouched.

Measured (edit a log string in `src/main/main.ml`, `dk1 update --no-imports`,
rebuild):

| Step | Linux_x86_64 | Windows_x86_64 |
| --- | --- | --- |
| Edit one file, rebuild | ~18 s ±3% | ~46 s ±7% |

Every figure is the mean of **four** runs of
`.github/workflows/measure-performance.yml` at one pin, and `±` is how far those
four spread: the sample standard deviation over the mean, rounded to a whole
percent.

## What gets cached

| Piece | Quick Setup source |
| --- | --- |
| OCaml compiler toolchain (`CommonsLang_OCaml.DkML@4.14.3`) | fetched prebuilt from the `dkpkg` release |
| Dune (`CommonsLang_OCaml.Dune@3.23.1`) | fetched prebuilt from the `dkpkg` release |
| opam and the build utilities (coreutils, 7-Zip, GNU make) | fetched prebuilt from the `dkpkg` releases |
| MSYS2 runtime (Windows slots) | fetched prebuilt from the `dkpkg` release |
| The 53 locked dependency packages (lwt, dap, menhir, ppxlib, …) | built locally once, then cached |
| The in-tree `earlybird` package | built locally, rebuilt on source edits |
| Localized source and final executable forms | built locally (copy and archive steps) |

dk object ids are *recipe* addresses (a hash of the values-file content, the
`module@version`, and the slot), and the recipe embeds this project's namespace,
so another project's cache of the same opam package serves no hits here. A
project's own prior releases are the cache that pays off for the dependency
packages, which is what the High Performance CI path sets up.

## Supported OCaml versions

This build compiles ocamlearlybird with OCaml 4.14.3 (the
`CommonsLang_OCaml.DkML@4.14.3` toolchain). A bytecode debugger must be built
with the same compiler version as the program it debugs, so this build debugs
programs compiled with OCaml 4.14.x.

To debug a program compiled with a different OCaml version, build ocamlearlybird
with that compiler using upstream's opam instructions (ocamlearlybird itself
supports OCaml 4.12 through 5.5); the dk pipeline here builds with 4.14.3.

### Why `dap` is held at `{>= "1.0.6" & < "1.1.0"}`

Upstream ocamlearlybird bumped `earlybird.opam` / `dune-project` to `dap {>= "1.1.0"}`
(the "dap 1.71 spec" change) and set the RunInTerminal field
`args_can_be_interpreted_by_shell`. **Do not re-bump `dap` here** while the build
targets the 4.14.3 toolchain: `dap` 1.1.0's dependency closure does not solve
against it. The `< "1.1.0"` upper bound is load-bearing on its own: this
branch's source does not set the RunInTerminal field that `dap` 1.1.0's record
type requires, so a plain `opam install` that selects `dap` 1.1.0 (which current
opam-repository permits on many compilers) fails to compile
(`Some record fields are undefined: args_can_be_interpreted_by_shell`). The
bound makes the opam metadata state what the source can actually build against.
Solving the closure per pinned OCaml gives:

| Pinned solve | Result |
| --- | --- |
| `ocaml 4.14.3` | no solution; the closure requires `ocaml (< 4.14.3 \| >= 5.0)` |
| `ocaml 5.5.0` | no solution; the closure requires `ocaml < 5.4` |
| `dap 1.1.0` on `ocaml 4.14.3` | no `dap` satisfies |

So the feasible OCaml window for `dap` 1.1.0 is `< 4.14.3` or `[5.0, 5.4)`, and
`CommonsLang_OCaml` ships compiler objects only at 4.14.3 / 5.4.1 / 5.5.0. The
`args_can_be_interpreted_by_shell` field is DAP-optional and was set to `None`
(the absent/default behaviour), so keeping `dap` at 1.0.6 and dropping that one
field is behaviour-neutral.

## Provenance

The dk packages this build depends on have been **100% AI generated and
maintained since June 2026**, and the dk build tool itself was **hand built but
AI assisted since June 2026**. This document, and the dk integration it
describes, were produced the same way.
