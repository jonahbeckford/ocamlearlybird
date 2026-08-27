# Building ocamlearlybird with the dk build tool

This document explains how to build the `ocamlearlybird` OCaml debug adapter
with [dk](https://diskuv.com/dk), a content-addressed build tool. It is
written for two audiences, people who just want the binary (**Users**) and
people who maintain this repository's dk integration (**Maintainers**), and it
is meant to double as a worked, replayable example of adopting dk for an
existing opam/dune project.

- [Building ocamlearlybird with the dk build tool](#building-ocamlearlybird-with-the-dk-build-tool)
  - [Provenance](#provenance)
  - [Quick Setup](#quick-setup)
    - [Quick Setup for Users](#quick-setup-for-users)
    - [Compared with a plain opam + dune setup](#compared-with-a-plain-opam-dune-setup)
    - [Quick Setup for Maintainers](#quick-setup-for-maintainers)
      - [The pin table (`dk-opam-pins.txt`)](#the-pin-table-dk-opam-pinstxt)
  - [High Performance](#high-performance)
    - [Why prebuilt fetch is fast](#why-prebuilt-fetch-is-fast)
    - [Publishing the project's own objects: `prepare-version` + `distribute`](#publishing-the-projects-own-objects-prepare-version-distribute)
    - [The closure build rule](#the-closure-build-rule)
    - [The Base 5.5 route](#the-base-55-route)
  - [Editing a file and rebuilding](#editing-a-file-and-rebuilding)
  - [Fast dev loop (opam venv)](#fast-dev-loop-opam-venv)
  - [Cached vs rebuilt opam packages](#cached-vs-rebuilt-opam-packages)
  - [DkML 4.14 vs OCaml (Base) 5.5](#dkml-414-vs-ocaml-base-55)
    - [Why `dap` is held at `{>= "1.0.6" & < "1.1.0"}`](#why-dap-is-held-at-106-110)

Every command below was run in this repository's CI container and the wall-clock
timings are the real measured numbers from that machine:

|        |                                      |
| ------ | ------------------------------------ |
| CPU    | Intel(R) Xeon(R) @ 2.80 GHz, 4 vCPUs |
| Memory | 16 GB                                |
| OS     | Ubuntu 24.04.4 LTS                   |
| Kernel | 6.18.5 (x86_64)                      |

Timings are illustrative and scale with core count and disk speed; treat them as
orders of magnitude.

> dk has two front-ends:
>
> - `dk0` (single-threaded, reference driver)
> - `dk1` (multi-threaded, the everyday driver)
>
> After cloning you can run `./dk1` in PowerShell or
> on macOS/Linux without an install

---

## Provenance

The dk packages this build depends on have been **100% AI generated and
maintained since June 2026**, and the dk build tool itself was **hand built but
AI assisted since June 2026**. This document, and the dk integration it
describes, were produced the same way.

## Quick Setup

The Quick Setup path builds ocamlearlybird from source **once on your machine**,
but it is far from a cold `opam install`: the OCaml compiler, Dune, opam, and the
supporting toolchain arrive as **prebuilt, cryptographically attested,
content-addressed objects** that dk lazily range-fetches from published Diskuv
package releases. They are never compiled locally. In other words, an existing
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

Adopting dk for an existing opam/dune project is the command sequence below,
shown for Linux. On macOS swap the slot in step 7 (`Release.Darwin_arm64`); on
Windows use PowerShell, `irm https://diskuv.com/dk/vendor.ps1 | iex` for step 1,
and `.\dk1.cmd` for the rest.

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
| `dk-src/dune-workspace` | dune workspace root marker staged into the assembled source |
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

The zero-argument `Refresh` discovers every committed driver
(`Ocamlearlybird.Closure` and `Ocamlearlybird.DevPrefix`) and, since
`Dk.OpamBuild@1.0.20`, regenerates a legacy per-package driver into the
one-line `F_BuildLockedClosure` form (a deliberate, object-id-churning change;
see *The closure build rule* below). `mode=check` is wired into
`distribute-1.3.yml`, so a stale driver fails in seconds at CI time.

> **Re-solve only with a Solve that filters test-only dependencies.** Through
> `Solve@1.1.4` the lock's `depends` array flattened opam's filters away, so an
> edge opam gates behind `{with-test}` was recorded as a build edge. That made
> the graph cyclic (`re` depends on `ppx_expect` only for its tests, while
> `ppx_expect` really depends on `re`), and a cyclic graph has no build order:
> dk1 parked the whole package fan-out and reported an engine deadlock
> (`7de29a4c`), while dk0 recursed until the stack overflowed. Re-solving with
> an older Solve reintroduces the cycle into `dk.opam-lock.jsonc`.

To regenerate the driver explicitly, `GenerateDriver` needs only the package
and the root; it derives the rest and stamps its parameters into the driver's
`generated` member:

```sh
./dk1 dialog CommonsLang_OCaml.Dk.OpamLock.GenerateDriver@1.1.12   pkg=NotHackwaly_Ocamlearlybird.Ocamlearlybird@1.3.6 root=earlybird
```

It builds the host tools (`ocamlfind`, `ocamlbuild`) at `Release.target_abi` by
default, so on a cross slot whose host can emulate the target
(WOW64/Rosetta/multilib) the findlib metadata matches the target and the tool
still runs; a matrix with a host-unemulatable cross slot passes
`hosttoolabi=Release.execution_abi` to restore the host-ABI pin. Every opam
package in the closure is its **own** content-addressed dk object built in
topological order, an interrupted build resumes from the objects already
completed, and `parallel=t` lets dk1 build independent packages concurrently.

After editing any workspace asset (`dune`, `dune-project`, `earlybird.opam`,
`src/`, or the lock) run `./dk1 update --no-imports` to refresh the recorded
checksums in `dk.u`, then rebuild. See *Editing a file and rebuilding*.

#### The pin table (`dk-opam-pins.txt`)

The pin table steers the opam solver. Its purpose is **not** to change what
ocamlearlybird depends on: `earlybird.opam` deliberately keeps *relaxed* version
constraints so the package stays installable for the whole worldwide opam
userbase, and the pin table must not tighten those. Instead the pins **converge
every maintainer and every CI run on the same resolved versions**, which is what
makes the content-addressed object cache hit: two people who solve the same
closure to the same versions produce the same object ids and therefore share
(and reuse) built objects. Pins raise cache hit rates without touching the opam
file's public constraints.

Each line, and the methodology for deriving your own:

```text
repo default git+https://github.com/ocaml/opam-repository.git#4f41495f12b15921ce982ac208c41b257d295515
```

> **Pin the opam-repository to one commit.** The solved closure is only
> reproducible run-to-run if the package index it solved against is fixed. Pin
> `default` to a specific opam-repository commit (here, master as of
> 2026-08-08). *Methodology:* use the commit your project's CI last validated
> against; bump it deliberately and re-solve.

```text
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

```text
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

## High Performance

Quick Setup builds ocamlearlybird's opam closure **from source** on your machine
(on top of prebuilt toolchain objects), so it compiles and links native code and
needs a system C toolchain on `PATH`. The High Performance path removes local
building entirely: the project publishes its **own** prebuilt, attested objects
in CI, and consumers `restore` + `run-object`/`get-object` them. On the consumer
side that is **fetch-and-run only**: no compiler, no linker, no local build at
all. Because Quick Setup already fetches its dependency objects prebuilt
(measured above), the two tiers reach a first runnable binary in about the same
time; the High Performance saving is the `earlybird` leaf compile and not
needing a host C toolchain.

### Why prebuilt fetch is fast

**A prebuilt object fetches and runs.** The OCaml 5.5 compiler ships as a
prebuilt object; fetching and running it needs no toolchain:

```sh
./dk1 get-object CommonsLang_OCaml.Base@5.5.0 -s Release.Linux_x86_64 -d ./ocaml55
./ocaml55/bin/ocamlopt.opt -version   # => 5.5.0
```

Measured fetch+extract: **~6 s**. `ldd ocamlopt.opt` resolves cleanly against
stock Ubuntu (`libc`, `libm`, `libdl`, `libpthread`, `ld-linux-x86-64.so.2`:
nothing DkML-specific), and both `ocamlopt.opt` and `ocamlc.opt` report `5.5.0`
and run. An already-linked object is just an ELF the loader is happy with, so a
path that only *fetches* already-linked objects skips the compile and link work
that Quick Setup does on every cold build.

As of `CommonsLang_OCaml` release `0.1.20260820083108` from-source linking also
succeeds on stock PIE-default Ubuntu: the DkML runtime archives are compiled PIC
(`libasmrun.a` and friends), so `ld` links them into a PIE executable without a
`-no-pie` override. Earlier releases baked a non-PIE runtime, so a from-source
link failed with `relocation R_X86_64_32 against ... can not be used when making
a PIE object` and needed a host shim; that shim is no longer required.

### Publishing the project's own objects: `prepare-version` + `distribute`

The mechanism that gives a project full cache hits is restoring against **its
own prior releases** (recall that object ids embed the project namespace, so
`dkpkg/CommonsBase_Dk`'s `Pkg.Lwt` object cannot alias this project's: only this
project's own published `Pkg.*` objects do). Setting that up is a two-command dk
workflow, wired into CI:

**1. `prepare-version MAJOR.MINOR`** mints the distribution signing keys and
records the public halves in-tree:

```sh
./dk1 prepare-version --ci github 1.3
```

It prompts for the **library id** (`NotHackwaly_Ocamlearlybird` here, the
`VendorQualifier_Unit` base the forms already use), then generates an
Ed25519-style keypair for the current version and the upcoming minor/major
versions. It **prints each secret key for you to store** (dk does not persist
secrets) and writes only the public keys to `etc/dk/d/1.3.PATCH.dist.json`;
`--ci github` scaffolds the release workflow. The license (`MIT`, from `dk.u`'s
`## License`) is recorded if not already set.

> **Key custody.** The secret keys are the project's release identity and must be
> generated in a secure environment and stored in a secret manager / GitHub
> Actions secret. They must never live in an ephemeral build container or a log.
> (For that reason the keys are **not** generated in this document's CI container;
> this section documents the workflow, and the repository owner runs
> `prepare-version` where the secrets can be custodied.)

**2. `distribute --library …@VERSION`** builds the objects on a compatible CI
builder and publishes the signed bundle (under `dk-dist/`) as a GitHub release.
`VERSION` must be a monotonically increasing patch of the prepared `MAJOR.MINOR`
(e.g. `NotHackwaly_Ocamlearlybird@1.3.YYYYMMDDhhmm`). Consumers then:

```sh
./dk1 restore github-l2 jonahbeckford/ocamlearlybird
./dk1 run-object NotHackwaly_Ocamlearlybird.Ocamlearlybird@1.3.6 \
  -s Release.Linux_x86_64 -m ./bin/ocamlearlybird.exe -- --help=plain
```

(The `-m` member is `./bin/ocamlearlybird.exe`, the exact archive name,
including the `./` prefix.)

The `run-object` finds every object already built and does **zero** local
compilation: on the consumer side the closure is a range-fetch of prebuilt,
attested objects that runs on stock Ubuntu.

Measured on GitHub Actions runners (`.github/workflows/measure-performance.yml`),
with the closure build rule (see *The closure build rule* below): fetching the
prebuilt closure and running the adapter takes **~2 m 42 s on Linux_x86_64** and
**~3 m 20 s on Windows_x86_64**, and the warm re-run afterward is **~6 s**
(Linux) and **~9 s** (Windows). The fetch reaches a runnable binary faster than
Quick Setup's first build (**~3 m 34 s** Linux, **~10 m 25 s** Windows) and far
faster than a from-scratch `opam switch create` + `opam install` + `dune build`
(**~5 m** Linux, **~16 m** Windows), which builds the compiler and every
dependency from source.

(Under the earlier per-package driver the fetch was ~3 m 50 s Linux / ~9 m
Windows and the warm re-run ~7 s / ~13 s. A warm re-run re-instantiated the
build rule once per package, 58 times, each re-decoding the whole lock; the
closure driver pays that instantiation once, verified as exactly one
`FORCE ...{rule}` on a warm run with zero rebuilds.)

> **`restore` and pruned releases.** `restore github-l2 ...` bulk-seeds the
> store by walking the distribution's release chain. As of dk `2.4.2.334` a
> pruned earlier release in that chain is tolerated: `restore` clears the
> partial seed and continues with a cold materialization of the requested
> release, emitting one WARNING, so removing superseded releases no longer
> breaks it. `run-object` and `get-object` fetch only the requested slot's
> object directly.

### The closure build rule

The generated driver run-functions **one** rule,
`CommonsLang_OCaml.Dk.OpamBuild.F_BuildLockedClosure` (since
`Dk.OpamBuild@1.0.20`), instead of one `F_BuildLockedPackage` per package. The
closure rule fetches and decodes the lock once, then a single submit registers
every package's build form -- each still its own content-addressed
`…Pkg.<Segment>@1.3.6` object -- plus an aggregate `…Closure.Built@1.3.6` form
whose unordered `get-object` precommands demand every package concurrently, so
the per-package build parallelism is unchanged.

Why one rule and not 58: a dk rule instantiation can never be trace-cached (its
scriptmodule dependency has no cloud-persistent hash, and a submit's form/task
registrations are side effects a cached value could not replay), so the engine
re-runs it on **every** command, warm or cold. Under the per-package driver
that meant re-instantiating the build rule 58 times per warm run, each time
re-decoding the whole 83 KB lock in lua-ml. The closure driver pays that once.

The trade is a one-time object-id churn: per-package `Pkg` value-ids derive from
the canonical id of the values document that registers them, so registering the
whole closure in ONE document re-keys every `Pkg` object relative to the
per-package driver (a full closure rebuild plus a `\dk.object` re-harvest in
`dist/any.u`, the same churn a lock change causes). It also couples them -- a
later lock edit that changes one package's form re-keys the whole closure. The
driver stays a committed, stamped artifact (Refresh's `mode=check` gate and the
offline build both read it); only its run-function lines collapsed from 58 to 1.

### The Base 5.5 route

`CommonsLang_OCaml` ships prebuilt, runnable `Base@5.5.0` and `Base@5.4.1`
objects alongside the relocatable `DkML@4.14.3` toolchain, and, as measured
above, the 5.5 objects fetch and run on Ubuntu today. What is **not** yet
possible is building the *adapter* against 5.5 through the opam pipeline: the
opam build rules `CommonsLang_OCaml.Dk.OpamBuild.F_BuildLockedPackage` and
`F_BuildLockedClosure` (which share one form synthesis) are currently
**hardwired to `ocaml:version = "4.14.3"`**, so the solved closure and the
build the closure driver drives are 4.14.3-only. Targeting a 5.5
debuggee (a bytecode debugger must match the debuggee's compiler) needs an
OpamBuild rule that **parameterizes** the toolchain version: a change on the
`CommonsLang_OCaml` side, filed upstream. Until then the 5.5 route demonstrates
the prebuilt-object model (fetch+run of `Base@5.5.0`); the
5.5 *adapter* build lands once the rule is parameterized.

---

## Editing a file and rebuilding

A natural question for an incremental build tool: after editing a source file,
does dk need an explicit *invalidate* command, or an `--integrity` option, to
notice the change?

**Neither.** `invalidate` (`-x`) is a manual escape hatch, and `--integrity`
(`none|existence|checksum`) tunes value-store integrity checking. They are not
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

## Fast dev loop (opam venv)

That whole-package rebuild is the right unit for a reproducible release build,
but it re-stages and relinks the entire leaf package on every edit (tens of
seconds; see the numbers above). For a tighter inner loop, materialize an *opam
venv* instead: a real, dune-usable opam prefix built from the same locked
dependency closure and the same DkML 4.14.3 compiler dk ships, so native
`dune build -w` runs directly against the working tree and recompiles only the
module you edited.

Set it up once (and again after any dependency change). The first dialog
generates a driver that merges the non-local closure into a single cached prefix
object; the second stages that prefix, the compiler, and dune into `./opam-venv`:

```sh
./dk1 dialog CommonsLang_OCaml.Dk.OpamLock.GenerateDriver@1.1.12 \
  pkg=NotHackwaly_Ocamlearlybird.Ocamlearlybird@1.3.6 root=earlybird \
  formid=NotHackwaly_Ocamlearlybird.Ocamlearlybird.DevPrefix@1.3.6 \
  skiplocal=t mergedprefix=t

./dk1 dialog CommonsLang_OCaml.Dk.OpamLock.OpamVenv@1.1.12
```

(`@1.1.12` derives `pkgpath`/`version`/`localsrc`/`out` from `pkg=` and defaults
`rulefn` to the newest `F_BuildLockedClosure` the import declares, so the
DevPrefix driver is the one-line closure form too; only `formid`, the two
prefix flags, and `root` are stated. Regenerate both drivers together with the
zero-argument `Refresh` shown above.)

Then, in each shell:

```powershell
. .\opam-venv\env.ps1              # Windows PowerShell (recommended)
# or:  source opam-venv/env.sh     # Unix / Git Bash
dune build -w                      # incremental; only the edited module recompiles
dune exec -- ocamlearlybird --help=plain
```

Illustrative inner-loop timings on a 6-core Ryzen 5 2600, Windows, MSVC (edit a
log string in `src/main/main.ml`):

| loop | time |
| --- | --- |
| opam venv: edit + `dune build @check` (typecheck) | **~1.9 s** |
| opam venv: edit + `dune build src/main/main.exe` (native relink) | **~9.3 s** |
| dk: edit + `dk1 update` + `run-object` (whole package) | **~48 s** (Windows CI; ~21 s Linux, above) |

`dune build --display short` after an edit confirms only `main` recompiles and
the executable relinks, nothing else.

**Parity.** The venv resolves to the same locked dependency versions and the same
`CommonsLang_OCaml.DkML@4.14.3` compiler the reproducible dk build uses (it is
driven from `dk.opam-lock.jsonc`), so `dune -w` behavior matches the shipped
binary, and earlybird keeps debugging bytecode compiled by that same 4.14.3
compiler.

**Isolation.** `opam-venv/` and dune's `_build/` are invisible to both git and to
dk's own reproducible build. dk0 drops a self-ignoring `.gitignore` (`*`) and a
`dune` (`(dirs)`) into its `t/` store, and the OpamVenv dialog does the same for
`opam-venv/`, so a host `dune build` never scans them and `dk1 run-object`
produces the identical binary. No tracked project file changes.

**Refresh.** After a dependency change, regenerate the driver then re-materialize:
`Refresh@1.1.12 driver=...DevPrefix...` followed by `OpamVenv@1.1.12`. A no-op
re-run is a fast stamp short-circuit; `force=t` rebuilds; a lock that drifted
from the driver makes OpamVenv stop and print the exact Refresh command.

**Windows.** `env.ps1` imports MSVC (vcvars) automatically for native linking. If
a native relink reports `LNK1104: cannot open ... main.exe`, a previous
`ocamlearlybird` process still holds the executable open, so stop it and rebuild.
For a VS Code task, launch `code .` from an activated shell so it inherits the
environment.

## Cached vs rebuilt opam packages

What actually gets built from source, and what arrives prebuilt?

**Never built locally (fetched as prebuilt, attested objects):**

- the OCaml compiler (`CommonsLang_OCaml.DkML@4.14.3`, all ABI slots),
- Dune (`CommonsLang_OCaml.Dune@3.23.1`), opam, coreutils, 7-Zip, and the other
  build utilities,

all lazily range-fetched from published `dkpkg` releases. This is the "partial
caching from an arbitrary CI-backed dk package" that makes Quick Setup fast.

**Built from source locally (once, then cached):** ocamlearlybird's opam
dependency closure: **53** packages including lwt, dap,
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
restoring against **its own** prior releases: this is exactly what the High
Performance CI path sets up.

## DkML 4.14 vs OCaml (Base) 5.5

Can this build target OCaml 5.5 instead of 4.14?

`CommonsLang_OCaml` ships **both** a relocatable `DkML@4.14.3` toolchain and
newer `Base@5.5.0` / `Base@5.4.1` compiler objects, and the 5.5 objects are real
and runnable (`dk1 run-object CommonsLang_OCaml.Base@5.5.0 … -m bin/ocamlopt`).
**However**, the opam build rules
(`CommonsLang_OCaml.Dk.OpamBuild.F_BuildLockedPackage` and its whole-closure
sibling `F_BuildLockedClosure`) are currently **hardwired
to `DkML@4.14.3`** (`ocaml:version = "4.14.3"` is baked into the shared form
synthesis, and the solve helper is compiled with 4.14.3). So *today*, the Quick Setup opam pipeline
is 4.14.3-only.

This matters for a debug adapter specifically: a bytecode debugger must match the
**debuggee's** compiler version. ocamlearlybird itself supports 4.12 → 5.5, so a
4.14.3-built adapter debugs 4.14.x programs. Targeting a 5.5 debuggee needs a 5.5
adapter, which needs an OpamBuild rule that parameterizes the toolchain. The
**High Performance** path (PR 2) is where the 5.5 route is exercised in CI.

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

