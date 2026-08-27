# Building ocamlearlybird with the dk build tool

This document explains how to build the `ocamlearlybird` OCaml debug adapter
with [dk](https://diskuv.com/dk), Diskuv's content-addressed build tool. It is
written for two audiences, people who just want the binary (**Users**) and
people who maintain this repository's dk integration (**Maintainers**), and it
is meant to double as a worked, replayable example of adopting dk for an
existing opam/dune project.

Every command below was run in this repository's CI container and the wall-clock
timings are the real measured numbers from that machine:

| | |
|---|---|
| CPU | Intel(R) Xeon(R) @ 2.80 GHz, 4 vCPUs |
| Memory | 16 GB |
| OS | Ubuntu 24.04.4 LTS |
| Kernel | 6.18.5 (x86_64) |

Timings are illustrative and scale with core count and disk speed; treat them as
orders of magnitude.

> **Two launchers, one tool.** dk ships two front-ends: `dk0` (single-threaded,
> minimal) and `dk1` (multi-threaded, the everyday driver). This project vendors
> both launcher scripts at the repo root, so after cloning you can run `./dk1`
> directly with no prior install, the launcher self-installs the pinned version
> recorded in `dk.u`. All commands below use `dk1`.

---

## Quick Setup

The Quick Setup path builds ocamlearlybird from source **once on your machine**,
but it is far from a cold `opam install`: the OCaml compiler, Dune, opam, and the
supporting toolchain arrive as **prebuilt, cryptographically attested,
content-addressed objects** that dk lazily range-fetches from published Diskuv
package releases, they are never compiled locally. In other words, an existing
CI-backed dk package (here `dkpkg/CommonsLang_OCaml`, which publishes the OCaml
toolchain objects) gives you **partial caching** for free. That partial cache,
the ability to pull an arbitrary, already-built dk package's objects and skip
rebuilding them, is one of the single biggest benefits of dk1 for opam projects:
the multi-minute compiler/toolchain build that dominates a from-scratch opam
switch simply does not happen.

What you still build locally in Quick Setup is ocamlearlybird's own opam
dependency closure (lwt, dap, menhir, ppxlib, …) plus ocamlearlybird itself, each
as its own cached dk object.

### Quick Setup for Users

You need two things: install dk1, then run one object.

**1. Install dk1** (installs both `dk0` and `dk1` into `~/.local/bin`, verified
with signify + SHA-256):

```sh
curl -fsSL https://diskuv.com/dk/install.sh | sh
# Windows PowerShell:  irm https://diskuv.com/dk/install.ps1 | iex
```

Measured: **~5 s**.

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
- everything after `--` is passed to the adapter.

The first run assembles ocamlearlybird's dependency closure: it fetches the
prebuilt toolchain and the locked dependency objects and builds the `earlybird`
leaf package from source. Measured on GitHub Actions runners
(`.github/workflows/measure-performance.yml`), the first run is **~3 m 34 s on
Linux_x86_64** and **~10 m 25 s on Windows_x86_64**. Subsequent runs are served
from the local object cache: the warm re-run is **~6 s on Linux_x86_64** and
**~14 s on Windows_x86_64**.

### Compared with a plain opam + dune setup

Building the same binary the standard way (`opam switch create`,
`opam install . --deps-only`, `dune build`) reaches a runnable binary more
slowly but then keeps a much faster inner loop. Measured on the same runners
(the `opam` figures include the switch create and compiler install):

| Step | dk Quick Setup | opam + dune |
| --- | --- | --- |
| Linux: fresh checkout to a runnable binary | ~3 m 34 s | ~5 m |
| Linux: re-run the built binary | ~6 s | ~0.1 s |
| Linux: edit one file, rebuild | ~21 s | ~0.2 s |
| Windows: fresh checkout to a runnable binary | ~10 m 25 s | ~16 m |
| Windows: re-run the built binary | ~14 s | ~1.3 s |
| Windows: edit one file, rebuild | ~48 s | ~1.5 s |

dk reaches a runnable binary first because it fetches the prebuilt, attested
toolchain and dependency objects while opam builds the compiler and every
dependency from source. Once built, dune's persistent `_build` gives a
sub-second inner loop, so a developer iterating on source is fastest under
`dune build -w` against a switch that reuses dk's already-built dependency
closure.

> **Linux host prerequisites.** Quick Setup compiles native code from source, so
> the host needs a C toolchain on `PATH`: on Ubuntu or Debian that is `curl` and
> `build-essential`. As of `CommonsLang_OCaml` release `0.1.20260820083108` the
> DkML toolchain objects bake bare `PATH`-resolved tool names (`gcc`, `as`) and
> ship a PIC runtime, so native compilation and linking succeed on stock
> PIE-default hosts (Ubuntu 24.04, Debian 12+) with the system toolchain and no
> further setup.

### Quick Setup for Maintainers

Adopting dk for an existing opam/dune project is the short command sequence
below. The commands live as executable, CI-tested files on the `adopt-sandbox`
branch: `sandbox/reduced/adopt.commands.linux.sh` is the canonical copy
(`.macos.sh` and `.windows.ps1` carry the same flow with platform transports),
and `.github/workflows/adopt-from-scratch.yml` replays all three platforms from
this repository's pre-dk commit. The steps, verbatim:

```sh
# 1. vendor the dk0/dk1 launchers into the repo
curl -fsSL https://diskuv.com/dk/vendor.sh | sh
# 2. durably accept the producer keys (the quickstart scaffold also imports
#    the CommonsBase_Build support package, so accept its key too)
./dk1 trust accept CommonsLang_OCaml --run --write
./dk1 trust accept CommonsBase_Build
# 3. scaffold dk.u, seed the pin table and .gitattributes, import the toolchain
./dk1 quickstart ocaml opam414
# 4. fetch and verify the toolchain import
./dk1 update
# 5. adopt: solve the lock, generate the build forms, register the assets
./dk1 dialog CommonsLang_OCaml.Dk.OpamLock.Adopt@1.1.11 version=1.3.6 unit=Ocamlearlybird ns=NotHackwaly_Ocamlearlybird
# 6. recompute the checksums of the registered workspace assets
./dk1 update
# 7. build and run the debug adapter
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
| `etc/dk/t/acceptances.json`, `etc/dk/t/capabilities.json` | durable trust records (step 2) |
| `dk.u` | workspace script: pinned imports + registered asset declarations (steps 3, 5, 6) |
| `dk-opam-pins.txt` | opam solve pin table, seeded by the quickstart (see below) |
| `dk.opam-lock.jsonc` | the solved, checked-in per-slot dependency lock (step 5) |
| `etc/dk/v/…/Ocamlearlybird.Src.values.jsonc` | generated localized-source form (step 5) |
| `etc/dk/v/…/Ocamlearlybird.Closure.values.jsonc` | generated one-line closure driver (step 5) |
| `etc/dk/v/…/Ocamlearlybird.values.jsonc` | generated thin final form exposing `bin/ocamlearlybird` (step 5) |
| `etc/dk/i/*.values.json`, `etc/dk/i/dk-closure-manifest.tsv` | verified import records (steps 3, 4) |

**Maintenance after adoption.** After a repin or a dependency change, the
zero-argument `Refresh` regenerates the committed driver from the stamped
parameters, and `mode=check` validates it read-only (CI-friendly):

```sh
./dk1 dialog CommonsLang_OCaml.Dk.OpamLock.Refresh@1.1.12               # regenerate the driver
./dk1 dialog CommonsLang_OCaml.Dk.OpamLock.Refresh@1.1.12 mode=solve    # re-solve the lock, then the driver
./dk1 dialog CommonsLang_OCaml.Dk.OpamLock.Refresh@1.1.12 mode=check    # read-only; nonzero if a driver is stale
./dk1 dialog CommonsLang_OCaml.Dk.OpamLock.Refresh@1.1.12 version=1.3.7 # bump earlybird across the coupled ids
```

After editing any workspace asset (`dune`, `dune-project`, `earlybird.opam`,
`src/`, or the lock) run `./dk1 update --no-imports` to refresh the recorded
checksums in `dk.u`, then rebuild, see *Editing a file and rebuilding*.

#### The pin table (`dk-opam-pins.txt`)

The pin table steers the opam solver. Its purpose is **not** to change what
ocamlearlybird depends on, `earlybird.opam` deliberately keeps *relaxed* version
constraints so the package stays installable for the whole worldwide opam
userbase, and the pin table must not tighten those. Instead the pins **converge
every maintainer and every CI run on the same resolved versions**, which is what
makes the content-addressed object cache hit: two people who solve the same
closure to the same versions produce the same object ids and therefore share
(and reuse) built objects. Pins raise cache hit rates without touching the opam
file's public constraints.

Each line, and the methodology for deriving your own:

```
repo default git+https://github.com/ocaml/opam-repository.git#4f41495f12b15921ce982ac208c41b257d295515
```
> **Pin the opam-repository to one commit.** The solved closure is only
> reproducible run-to-run if the package index it solved against is fixed. Pin
> `default` to a specific opam-repository commit (here, master as of
> 2026-08-08). *Methodology:* use the commit your project's CI last validated
> against; bump it deliberately and re-solve.

```
pin ocaml 4.14.3
pin ocaml-base-compiler 4.14.3
```
> **Pin the compiler to the toolchain's version.** The per-package build rule
> (`CommonsLang_OCaml.Dk.OpamBuild`) compiles every package with the relocatable
> `CommonsLang_OCaml.DkML@4.14.3` toolchain, so the lock must resolve the 4.14.x
> dependency closure. Without this pin the solver picks the newest OCaml (5.x)
> and selects 5.x-only package versions that would not compile under 4.14.3.
> *Methodology:* pin `ocaml` **and** its implementation package
> (`ocaml-base-compiler`) to exactly the compiler version your dk toolchain
> object provides.

```
pin dune 3.23.1
```
> **Pin every toolchain-provided tool to the version dk ships.** The toolchain
> provides `CommonsLang_OCaml.Dune@3.23.1`, which lags opam-repository master. An
> unpinned solve pulls packages (e.g. `dune-configurator` 3.24.x) that declare
> `dune {>= "3.24"}` and ship `(lang dune 3.24)`, which the provided Dune 3.23.1
> refuses ("Version 3.24 of the dune language is not supported"). Pinning `dune`
> to the provided version makes the solver choose dune-3.23-compatible package
> versions. *Methodology (general rule):* for every build tool the dk toolchain
> provides (ocaml, dune, and any future additions), pin the opam package to the
> exact version dk ships, so the solved closure matches what actually builds it.

The pin-file grammar also supports `float NAME` (drop a pin inherited from an
existing switch) and `archexclude NAME ARCH` (exclude a package on one ABI); this
project needs neither.

---

<!-- The "## High Performance" section is added on the dk1-high-performance branch (PR 2). -->

## Editing a file and rebuilding

A natural question for an incremental build tool: after editing a source file,
does dk need an explicit *invalidate* command, or an `--integrity` option, to
notice the change?

**Neither.** `invalidate` (`-x`) is a manual escape hatch, and `--integrity`
(`none|existence|checksum`) tunes value-store integrity checking, they are not
the edit-rebuild mechanism. The documented flow is:

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

Measured edit-one-file rebuild (edit a log string in `src/main/main.ml`,
`dk1 update --no-imports`, rebuild) on GitHub Actions runners: **~21 s on
Linux_x86_64** and **~48 s on Windows_x86_64**. Only the localized-source object
and the `earlybird` leaf package object rebuild; the dependency objects stay
cached.

## Cached vs rebuilt opam packages

What actually gets built from source, and what arrives prebuilt?

**Never built locally (fetched as prebuilt, attested objects):**

- the OCaml compiler (`CommonsLang_OCaml.DkML@4.14.3`, all ABI slots),
- Dune (`CommonsLang_OCaml.Dune@3.23.1`), opam, coreutils, 7-Zip, and the other
  build utilities,

all lazily range-fetched from published `dkpkg` releases. This is the "partial
caching from an arbitrary CI-backed dk package" that makes Quick Setup fast.

**Built from source locally (once, then cached):** ocamlearlybird's opam
dependency closure, **53** packages including lwt, dap,
menhir, ppxlib, ppx_deriving_yojson, sexplib/num, yojson, plus the in-tree
`earlybird` package. Each becomes its own cached object, so the second build (and
every incremental build after an edit) reuses all of them.

**On cross-project cache sharing:** dk object ids are *recipe* addresses, a hash
of the values-file content, the `module@version`, and the slot, and the recipe
embeds this project's namespace (`NotHackwaly_Ocamlearlybird`). So this project's
`…Pkg.Lwt@…` object cannot alias `CommonsBase_Dk.Dk1.Pkg.Lwt@…`; running
`dk1 restore github-l2 dkpkg/CommonsBase_Dk` (measured **~2 m**) seeds the
toolchain objects but yields **zero** hits on the per-package `Pkg.*` objects.
The mechanism that *does* pay off for a project's own dependency objects is
restoring against **its own** prior releases, which is exactly what the High
Performance CI path sets up.

## DkML 4.14 vs OCaml (Base) 5.5

Can this build target OCaml 5.5 instead of 4.14?

`CommonsLang_OCaml` ships **both** a relocatable `DkML@4.14.3` toolchain and
newer `Base@5.5.0` / `Base@5.4.1` compiler objects, and the 5.5 objects are real
and runnable (`dk1 run-object CommonsLang_OCaml.Base@5.5.0 … -m bin/ocamlopt`).
**However**, the per-package opam build rule
(`CommonsLang_OCaml.Dk.OpamBuild.F_BuildLockedPackage`) is currently **hardwired
to `DkML@4.14.3`** (`ocaml:version = "4.14.3"` is baked into the rule, and the
solve helper is compiled with 4.14.3). So *today*, the Quick Setup opam pipeline
is 4.14.3-only.

This matters for a debug adapter specifically: a bytecode debugger must match the
**debuggee's** compiler version. ocamlearlybird itself supports 4.12 → 5.5, so a
4.14.3-built adapter debugs 4.14.x programs. Targeting a 5.5 debuggee needs a 5.5
adapter, which needs an OpamBuild rule that parameterizes the toolchain rather
than hardwiring 4.14.3. The **High Performance** path (PR 2) is where the 5.5
route is exercised in CI.

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
bound makes the opam metadata state what the source can actually build against. Solving the closure (with `Solve@1.1.5`, which already filters
test-only edges) gives, per pinned OCaml:

- `ocaml 4.14.3` → no solution, closure requires `ocaml (< 4.14.3 | >= 5.0)`;
- `ocaml 5.5.0`  → no solution, closure requires `ocaml < 5.4`;
- `dap 1.1.0` pinned on `ocaml 4.14.3` → no dap satisfies.

So the feasible OCaml window is `< 4.14.3` **or** `[5.0, 5.4)`, and
`CommonsLang_OCaml` ships Base objects only at 4.14.3 / 5.4.1 / 5.5.0, none in
that window. The `args_can_be_interpreted_by_shell` field is DAP-optional and was
set to `None` (the absent/default behaviour), so keeping `dap` at 1.0.6 and
dropping that one field is behaviour-neutral. Re-bumping `dap` (to get the 1.71
spec features) is gated on **both** a 5.0–5.3 `Base` toolchain object (not yet
shipped) **and** the parameterized OpamBuild rule above.

## Provenance

The dk packages this build depends on have been **100% AI generated and
maintained since June 2026**, and the dk build tool itself was **hand built but
AI assisted since June 2026**. This document, and the dk integration it
describes, were produced the same way.
