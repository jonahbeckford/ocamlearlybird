# Building ocamlearlybird with the dk build tool

This document explains how to build the `ocamlearlybird` OCaml debug adapter
with [dk](https://diskuv.com/dk), Diskuv's content-addressed build tool. It is
written for two audiences — people who just want the binary (**Users**) and
people who maintain this repository's dk integration (**Maintainers**) — and it
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
orders of magnitude, not guarantees.

> **Two launchers, one tool.** dk ships two front-ends: `dk0` (single-threaded,
> minimal) and `dk1` (multi-threaded, the everyday driver). This project vendors
> both launcher scripts at the repo root, so after cloning you can run `./dk1`
> directly with no prior install — the launcher self-installs the pinned version
> recorded in `dk.u`. All commands below use `dk1`.

---

## Quick Setup

The Quick Setup path builds ocamlearlybird from source **once on your machine**,
but it is far from a cold `opam install`: the OCaml compiler, Dune, opam, and the
supporting toolchain arrive as **prebuilt, cryptographically attested,
content-addressed objects** that dk lazily range-fetches from published Diskuv
package releases — they are never compiled locally. In other words, an existing
CI-backed dk package (here `dkpkg/CommonsLang_OCaml`, which publishes the OCaml
toolchain objects) gives you **partial caching** for free. That partial cache —
the ability to pull an arbitrary, already-built dk package's objects and skip
rebuilding them — is one of the single biggest benefits of dk1 for opam projects:
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

The first run builds ocamlearlybird's dependency closure (measured cold build:
**~22 m 35 s**). Subsequent runs are served entirely from the local
object cache (measured warm run: **~32 s**).

> **Linux host prerequisites.** The toolchain objects are built with Diskuv's
> relocatable DkML compiler, which currently expects a GCC toolset at
> `/opt/rh/gcc-toolset-14/...` and a non-PIE default. On a stock Ubuntu host that
> is not present, so the linker/assembler must be made discoverable and PIE
> disabled. This is a portability gap in the DkML toolchain objects (filed
> upstream as Diskuv issues), not in ocamlearlybird; see *Cached vs rebuilt opam
> packages* for the exact shim used in this container.

### Quick Setup for Maintainers

Adopting dk for an existing opam/dune project means adding a small set of
checked-in files that describe the build as content-addressed objects. This
repository's integration mirrors the reference exemplar `dkpkg/CommonsBase_Dk`
(which builds dk itself). The pieces are:

| File | Role |
|---|---|
| `dk0`, `dk1`, `dk0.cmd`, `dk1.cmd` | vendored self-installing launchers |
| `dk.u` | workspace script: pinned imports + source-tree asset declarations |
| `dk-opam-pins.txt` | opam solve pin table (see below) |
| `dk.opam-lock.jsonc` | the generated, checked-in per-slot dependency lock |
| `etc/dk/v/…/Ocamlearlybird.Src.values.jsonc` | localized-source form (the in-tree `earlybird` package as one object) |
| `etc/dk/v/…/Ocamlearlybird.Closure.values.jsonc` | generated driver: one build object per closure package |
| `etc/dk/v/…/Ocamlearlybird.values.jsonc` | thin final form exposing `bin/ocamlearlybird` |
| `etc/dk/i/*.values.json` | verified import records (written by `dk1 add`/`update`) |

The workflow to (re)generate them:

**1. Start the workspace and add imports with `dk1 add`** — never hand-write the
`%% import` blocks. Begin from a no-import `dk.u`, then let dk fetch and pin the
exact import block (version + multi-hash checksum) for you:

```sh
env -u GH_TOKEN -u GITHUB_TOKEN \
  ./dk1 --trust-local-package CommonsLang_OCaml -- add github-l2 dkpkg/CommonsLang_OCaml
./dk1 update
```

`dk1 add` writes the pinned import into `dk.u` and a verified import record under
`etc/dk/i/`; `dk1 update` refreshes the workspace-asset checksums. This is the
adoption step to teach: you get a reproducible, checksum-pinned dependency on the
toolchain package without copying magic strings by hand.

**2. Write the opam pin table** (`dk-opam-pins.txt`) — see *The pin table* below
for the full rationale of each line — and **solve** the dependency closure into a
checked-in lock:

```sh
./dk1 dialog CommonsLang_OCaml.Dk.OpamLock.Solve@1.1.5 \
  'roots[]=earlybird' 'locals[]=earlybird' opam=t/opam.exe
```

This writes `dk.opam-lock.jsonc`: a per-slot frozen graph (versions, source
URLs + checksums, dependency edges, raw opam build/install fields). Measured
(8 ABI slots): **~1 m 41 s – 2 m 20 s**.

**3. Generate the per-package build driver** from the lock:

```sh
./dk1 dialog CommonsLang_OCaml.Dk.OpamLock.GenerateDriver@1.1.5 \
  lock=dk.opam-lock.jsonc \
  out=etc/dk/v/NotHackwaly_Ocamlearlybird/Ocamlearlybird.Closure.values.jsonc \
  root=earlybird \
  formid=NotHackwaly_Ocamlearlybird.Ocamlearlybird.Closure@1.3.6 \
  pkgpath=NotHackwaly_Ocamlearlybird.Ocamlearlybird version=1.3.6 \
  rulefn=CommonsLang_OCaml.Dk.OpamBuild.F_BuildLockedPackage@1.0.14 \
  localsrc=NotHackwaly_Ocamlearlybird.Ocamlearlybird.Src@1.3.6 \
  locksrcpath=./dk-opam-lock.jsonc parallel=t
```

Every opam package in the closure becomes its **own** content-addressed dk object
built in topological order; `parallel=t` lets dk1 build independent packages
concurrently, and an interrupted build resumes from the objects already
completed.

**4. Author the two hand-written forms.** `Ocamlearlybird.Src.values.jsonc`
assembles the working tree (from the `dk.u` workspace assets) into a single
`output.zip` object that the generic opam build rule stages as the source of the
one in-tree package (`earlybird`, marked `local:"t"` in the lock). Then the thin
`Ocamlearlybird.values.jsonc` republishes the root package's install output as
`bin/ocamlearlybird` per slot. Both are short and modeled directly on
CommonsBase_Dk's `MlFrontSource` + final form.

After editing any workspace asset (`dune`, `dune-project`, `earlybird.opam`,
`src/`, or the lock) run `./dk1 update --no-imports` to refresh the recorded
checksums in `dk.u`, then rebuild — see *Editing a file and rebuilding*.

#### The pin table (`dk-opam-pins.txt`)

The pin table steers the opam solver. Its purpose is **not** to change what
ocamlearlybird depends on — `earlybird.opam` deliberately keeps *relaxed* version
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
> against; bump it deliberately and re-solve, rather than letting `master` drift
> under you.

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
(`none|existence|checksum`) tunes value-store integrity checking — they are not
the edit-rebuild mechanism. The documented flow is:

```sh
# edit e.g. src/main/main.ml, then:
./dk1 update --no-imports          # recompute workspace-asset checksums in dk.u
./dk1 run-object NotHackwaly_Ocamlearlybird.Ocamlearlybird@1.3.6 \
  -s Release.Linux_x86_64 -m bin/ocamlearlybird.exe -- --help=plain
```

dk0/dk1 re-checksum workspace assets **only on `update`**, so `dk1 update` is what
turns a working-tree edit into a new content hash. Because the object graph is
content-addressed, only the objects whose inputs actually changed rebuild — here
the localized-source object and the local `earlybird` package object — while every
external package object stays cached and is reused untouched.

Measured edit-one-file rebuild (edit a log string in `src/main/main.ml`,
`dk1 update --no-imports`, rebuild): **~3 m 15 s** — versus the cold
build of **~22 m 35 s**.

## Cached vs rebuilt opam packages

What actually gets built from source, and what arrives prebuilt?

**Never built locally (fetched as prebuilt, attested objects):**

- the OCaml compiler (`CommonsLang_OCaml.DkML@4.14.3`, all ABI slots),
- Dune (`CommonsLang_OCaml.Dune@3.23.1`), opam, coreutils, 7-Zip, and the other
  build utilities,

all lazily range-fetched from published `dkpkg` releases. This is the "partial
caching from an arbitrary CI-backed dk package" that makes Quick Setup fast.

**Built from source locally (once, then cached):** ocamlearlybird's opam
dependency closure — **53** packages including lwt, dap,
menhir, ppxlib, ppx_deriving_yojson, sexplib/num, yojson — plus the in-tree
`earlybird` package. Each becomes its own cached object, so the second build (and
every incremental build after an edit) reuses all of them.

**On cross-project cache sharing:** dk object ids are *recipe* addresses — a hash
of the values-file content, the `module@version`, and the slot — and the recipe
embeds this project's namespace (`NotHackwaly_Ocamlearlybird`). So this project's
`…Pkg.Lwt@…` object cannot alias `CommonsBase_Dk.Dk1.Pkg.Lwt@…`; running
`dk1 restore github-l2 dkpkg/CommonsBase_Dk` (measured **~2 m**) seeds the
toolchain objects but yields **zero** hits on the per-package `Pkg.*` objects.
The mechanism that *does* pay off for a project's own dependency objects is
restoring against **its own** prior releases — which is exactly what the High
Performance CI path sets up.

> **Host-prerequisite shim used in this container.** Stock Ubuntu 24.04 lacks the
> `/opt/rh/gcc-toolset-14` layout the DkML toolchain objects expect, and defaults
> to PIE while the DkML runtime needs `-no-pie`. The shim (not committed; a host
> concern, filed upstream against Diskuv) symlinks the system binutils/gcc into
> the expected toolset path and wraps `gcc` with `-fno-PIE -no-pie`:
> ```sh
> D=/opt/rh/gcc-toolset-14/root/usr/bin; mkdir -p "$D"
> for t in g++ cc as ld ar ranlib nm objdump objcopy strip cpp; do ln -sf /usr/bin/$t "$D/$t"; done
> printf '#!/bin/sh\nexec /usr/bin/gcc -fno-PIE -no-pie "$@"\n' > "$D/gcc"; chmod +x "$D/gcc"
> ```

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

### Why `dap` is held at `>= 1.0.6`, not upstream's `>= 1.1.0`

Upstream ocamlearlybird bumped `earlybird.opam` / `dune-project` to `dap {>= "1.1.0"}`
(the "dap 1.71 spec" change) and set the RunInTerminal field
`args_can_be_interpreted_by_shell`. **Do not re-bump `dap` here** while the build
targets the 4.14.3 toolchain: `dap` 1.1.0's dependency closure does not solve
against it. Solving the closure (with `Solve@1.1.5`, which already filters
test-only edges) gives, per pinned OCaml:

- `ocaml 4.14.3` → no solution, closure requires `ocaml (< 4.14.3 | >= 5.0)`;
- `ocaml 5.5.0`  → no solution, closure requires `ocaml < 5.4`;
- `dap 1.1.0` pinned on `ocaml 4.14.3` → no dap satisfies.

So the feasible OCaml window is `< 4.14.3` **or** `[5.0, 5.4)`, and
`CommonsLang_OCaml` ships Base objects only at 4.14.3 / 5.4.1 / 5.5.0 — none in
that window. The `args_can_be_interpreted_by_shell` field is DAP-optional and was
set to `None` (the absent/default behaviour), so keeping `dap` at 1.0.6 and
dropping that one field is behaviour-neutral. Re-bumping `dap` (to get the 1.71
spec features) is gated on **both** a 5.0–5.3 `Base` toolchain object (not yet
shipped) **and** the parameterized OpamBuild rule above.

## Suggested dk1 quickstart improvements

Dogfooding the adoption produced concrete, actionable feedback for dk:

1. **`dk1 quickstart ocaml opam` scaffolds a stale import.** It writes a `dk.u`
   importing `dkpkg/CommonsLang_OCaml` at tag `2.5.202606301755`, while the live
   registry is on `0.1.2026…`. The `dk1 add` flow this document teaches is the
   reliable way to get a current, checksum-pinned import — the quickstart recipe
   should pin to the current tag (or omit the version and resolve it).
2. **Its `next_steps` text is obsolete.** It prints a `dk0 get-object
   CommonsLang_OCaml.Dk.OpamLock.Solve -s Release.Agnostic -f dk.opam-lock.jsonc`
   invocation that no longer matches the current `Solve@1.1.0` dialog (which needs
   `roots[]=`, a pins file, and `local_opam_dir=`/`opam=`).
3. **Scaffold `dk-opam-pins.txt`.** The recipe schema already supports
   `seed_files`; it could drop a commented pins template so new adopters see the
   pin mechanism immediately.
4. **Mention the remaining adoption steps** (GenerateDriver + the Src and thin
   forms) in `next_steps`, since a solve alone does not produce a runnable object.

## Follow-up: document the vendoring scripts

`https://diskuv.com/dk/vendor.sh` (and `vendor.ps1` for Windows) download and
pin the `dk0`/`dk1` launchers into a repository, but they are **not documented**
on diskuv.com. Follow-up: get `vendor.sh` / `vendor.ps1` documented alongside the
`install.sh` / `install.ps1` one-liners.

## Provenance

The dk packages this build depends on have been **100% AI generated and
maintained since June 2026**, and the dk build tool itself was **hand built but
AI assisted since June 2026**. This document, and the dk integration it
describes, were produced the same way.
