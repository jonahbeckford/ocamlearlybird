# Building ocamlearlybird with the dk build tool

This document explains how to build the `ocamlearlybird` OCaml debug adapter
with [dk](https://diskuv.com/dk), a Windows-friendly, incremental, remote
cacheable build system. It is
written for two audiences, people who just want the binary (**Users**) and
people who maintain this repository's dk integration (**Maintainers**), and it
is meant to double as a worked, replayable example of adopting dk for an
existing opam/dune project.

## Provenance

The dk packages this build depends on have been **100% AI generated and
maintained since June 2026**, and the dk build tool itself was **hand built but
AI assisted since June 2026**.

---

## Quick Setup

The Quick Setup path builds ocamlearlybird from source once on your machine,
on top of a prebuilt toolchain: the OCaml compiler, Dune, opam, and the
supporting build utilities arrive as prebuilt
objects that dk lazily range-fetches from published Diskuv
package releases. An existing CI-backed dk package (here
`dkpkg/CommonsLang_OCaml`, which publishes the OCaml toolchain objects) gives
you that partial caching for free.

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

**2. Build and run the debug adapter** as a single object:

```sh
./dk1 run-object NotHackwaly_Ocamlearlybird.Ocamlearlybird@1.3.6 \
  -s Release.execution_abi \
  -m bin/ocamlearlybird.exe \
  -- --help
```

- `-s Release.execution_abi` selects the object built for the host you are on, so the
  same command works on Linux, macOS and Windows without editing the slot.
- `-m bin/ocamlearlybird.exe` selects the member of the built object to execute.
- everything after `--` is passed to the debug adapter.

### Quick Setup for Maintainers

Adopting dk for an existing opam/dune project is the command sequence below,
shown for Linux. On macOS swap the slot in step 6 (`Release.Darwin_arm64`); on
Windows use PowerShell, `irm https://diskuv.com/dk/vendor.ps1 | iex` for step 1,
and `.\dk1.cmd` for the rest.

```sh
# 1. vendor the dk0/dk1 launchers into the repo
curl -fsSL https://diskuv.com/dk/vendor.sh | sh
# 2. scaffold dk.u, seed the pin table and .gitattributes, record the
#    quickstart's declared trust statements, and import the toolchain
./dk1 quickstart ocaml opam414
# 3. fetch and verify the toolchain import
./dk1 update
# 4. adopt: solve the lock, generate the build forms, register the assets
./dk1 dialog CommonsLang_OCaml.Dk.OpamLock.Adopt@1.1.14 version=1.3.6 unit=Ocamlearlybird ns=NotHackwaly_Ocamlearlybird
# 5. recompute the checksums of the registered workspace assets
./dk1 update
# 6. build and run the debug adapter
./dk1 run-object NotHackwaly_Ocamlearlybird.Ocamlearlybird@1.3.6 \
  -s Release.execution_abi -m ./bin/ocamlearlybird.exe -- --help
```

`ns=` keeps this fork's committed third-party namespace; a maintainer adopting
their own project omits it and gets a namespace derived from the repository.

What the above sequence of commands produces:

| File | Role |
|---|---|
| `dk0`, `dk1`, `dk0.cmd`, `dk1.cmd` | vendored self-installing launchers (step 1) |
| `etc/dk/t/acceptances.json`, `etc/dk/t/capabilities.json` | trust records from the quickstart's declared trust statements (step 2) |
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

## High Performance

Quick Setup builds ocamlearlybird's opam closure from source on your machine
(on top of prebuilt toolchain objects), so it compiles and links native code and
needs a system C toolchain on `PATH`. The High Performance path publishes the
project's **own** prebuilt objects in CI; on the consumer side the
whole closure is a fetch-and-run of already-built objects.

### Publishing the project's own objects: `prepare-version` + `distribute`

The cache that pays off for a project's dependency packages is the project's
**own prior releases** (object ids embed the project namespace, so only this
project's published `Pkg.*` objects serve its fetches). Setting that up is a
two-command dk workflow, wired into CI:

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
> (For that reason the keys were **not** generated in this document's CI
> container; this section documents the workflow, and the repository owner runs
> `prepare-version` where the secrets can be custodied.)

**2. `distribute --library …@VERSION`** builds the objects on a compatible CI
builder and publishes the signed bundle (under `dk-dist/`) as a GitHub release.
`VERSION` must be a monotonically increasing patch of the prepared `MAJOR.MINOR`
(e.g. `NotHackwaly_Ocamlearlybird@1.3.YYYYMMDDhhmm`). Consumers then:

```sh
./dk1 restore github-l2 jonahbeckford/ocamlearlybird
./dk1 run-object NotHackwaly_Ocamlearlybird.Ocamlearlybird@1.3.6 \
  -s Release.execution_abi -m ./bin/ocamlearlybird.exe -- --help
```

(The `-m` member is `./bin/ocamlearlybird.exe`, the exact archive name,
including the `./` prefix.)

## Fast dev loop (opam venv)

For productivity you can get incremental `dune build -w` builds and IDE support. Set up a dk-enabled opam environment once:

```sh
./dk1 --trust-local-package NotHackwaly_Ocamlearlybird   dialog CommonsLang_OCaml.Dk.OpamLock.OpamVenv@1.1.14
```

(`--trust-local-package` lets the dialog resolve this workspace's own
`NotHackwaly_Ocamlearlybird` forms; the venv is a maintainer inner loop against
the working tree.)

Then, in each shell:

```powershell
. .\opam-venv\env.ps1              # Windows PowerShell (recommended)
# or:  source opam-venv/env.sh     # Unix / Git Bash
dune build -w                      # incremental; only the edited module recompiles
dune exec -- ocamlearlybird --help
```

**Parity.** The venv resolves to the same locked dependency versions and the same
`CommonsLang_OCaml.DkML@4.14.3` compiler the reproducible dk build uses (it is
driven from `dk.opam-lock.jsonc`), so `dune -w` behavior matches the shipped
binary, and earlybird keeps debugging bytecode compiled by that same 4.14.3
compiler.

**Isolation.** `opam-venv/` and dune's `_build/` are invisible to both git and to
dk's own reproducible build: the OpamVenv dialog drops a self-ignoring
`.gitignore` and a `dune` `(dirs)` guard into `opam-venv/`, so a host
`dune build` never scans it and `dk1 run-object` produces the identical binary.

**Refresh.** After a dependency change, regenerate the drivers and re-materialize:
the zero-argument `Refresh@1.1.14` (see *Maintenance after adoption*) followed by
`OpamVenv@1.1.14`.

**Windows.** `env.ps1` imports MSVC (vcvars) automatically for native linking. If
a native relink reports `LNK1104: cannot open ... main.exe`, a previous
`ocamlearlybird` process still holds the executable open, so stop it and rebuild.
For a VS Code task, launch `code .` from an activated shell so it inherits the
environment.

## Editing a file and rebuilding

The supported flow after editing a source file:

```sh
# edit e.g. src/main/main.ml, then:
./dk1 update --no-imports          # recompute workspace-asset checksums in dk.u
./dk1 run-object NotHackwaly_Ocamlearlybird.Ocamlearlybird@1.3.6 \
  -s Release.execution_abi -m bin/ocamlearlybird.exe -- --help
```

dk0/dk1 re-checksum workspace assets **only on `update`**, so `dk1 update` is what
turns a working-tree edit into a new content hash, so only the objects whose
inputs actually changed rebuild, here
the localized-source object and the local `earlybird` package object, while every
external package object stays cached and is reused untouched.

## What gets cached

| Piece | High Performance source |
| --- | --- |
| OCaml compiler toolchain (`CommonsLang_OCaml.DkML@4.14.3`) | fetched prebuilt from the `dkpkg` release |
| Dune (`CommonsLang_OCaml.Dune@3.23.1`) | fetched prebuilt from the `dkpkg` release |
| opam and the build utilities (coreutils, 7-Zip, GNU make) | fetched prebuilt from the `dkpkg` releases |
| MSYS2 runtime (Windows slots) | fetched prebuilt from the `dkpkg` release |
| The 53 locked dependency packages (lwt, dap, menhir, ppxlib, …) | fetched prebuilt from this project's release |
| The in-tree `earlybird` package | fetched prebuilt from this project's release; rebuilt locally on source edits |
| Localized source and final executable forms | fetched prebuilt from this project's release; rebuilt locally on source edits |

A dk object id is a hash of the values-file content, the `module@version`, and
the slot, and the id embeds this project's namespace. A
project's own prior releases are the cache that pays off for the dependency
packages, which is what the High Performance CI path sets up.

## Supported OCaml versions

This build compiles ocamlearlybird with OCaml 4.14.3 (the
`CommonsLang_OCaml.DkML@4.14.3` toolchain). A bytecode debugger must be built
with the same compiler version as the program it debugs, so this build debugs
programs compiled with OCaml 4.14.x.

To debug a program compiled with a different OCaml version, build ocamlearlybird
with that compiler using upstream's opam instructions; the dk pipeline here
builds with 4.14.3.

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
