## What this branch does

Adds [dk](https://diskuv.com/dk), a Windows-friendly, incremental, remote cacheable build system, as a build path for ocamlearlybird. This is the **Quick Setup** branch: a from-source build of the full opam dependency closure. The OCaml toolchain (compiler, Dune, opam, build utilities) is prebuilt, and ocamlearlybird's own 53-package closure (lwt, dap, menhir, ppxlib, …) plus the in-tree `earlybird` package compile locally, each as its own cached dk object.

After cloning, a user needs one command (the vendored launcher self-installs):

```sh
./dk1 run-object NotHackwaly_Ocamlearlybird.Ocamlearlybird@1.3.6 \
  -s Release.Linux_x86_64 -m bin/ocamlearlybird.exe -- --help=plain
```

See [CLO.md](https://github.com/jonahbeckford/ocamlearlybird/blob/dk1-quick-setup/CLO.md) for the fully worked adoption guide (Users and Maintainers), including the six-command adoption sequence, the pin table delta, and the reason `dap` is held at `{>= "1.0.6" & < "1.1.0"}` on the 4.14.3 toolchain.

## Provenance

The dk packages this build depends on have been **100% AI generated and maintained since June 2026**, and the dk build tool itself was **hand built but AI assisted since June 2026**.

## Performance

Performance was measured on GitHub Actions runners with dk <!--VER:dk-->2.4.3.20<!--/VER:dk--> and opam 2.5.2 (`.github/workflows/measure-performance.yml`, which also measures a conventional `opam switch create` + `opam install . --deps-only` + `dune build` on the same runners, compiler install included):

<!--PERF:comparison-pr1-->
| Step | dk Quick Setup | opam nocache + dune (desktop) | opam cache + dune |
| --- | --- | --- | --- |
| Linux: fresh checkout to a runnable binary | ~3 m 1 s ±6% | ~4 m 32 s ±20% | ~2 m 19 s ±10% |
| Linux: re-run the built binary | ~7 s ±16% | ~0.1 s ±14% | ~0.1 s ±14% |
| Linux: edit one file, rebuild | ~17 s ±10% | ~0.2 s ±15% | ~0.2 s ±15% |
| Windows: fresh checkout to a runnable binary | ~9 m 2 s ±8% | ~14 m 35 s ±11% | ~8 m 18 s ±13% |
| Windows: re-run the built binary | ~18 s ±29% | ~1.1 s ±19% | ~1.1 s ±19% |
| Windows: edit one file, rebuild | ~44 s ±7% | ~1.3 s ±19% | ~1.3 s ±19% |
<!--/PERF:comparison-pr1-->

**What each fresh checkout figure includes.** The columns reach a runnable binary through different work, and they also stop in different places, so the numbers are comparable only once both are named. The dk figure is one command, `./dk1 run-object ... -- --help=plain`, and its timed region covers the vendored launcher self-installing the engine pinned in `dk.u`, the lazy fetch of the prebuilt toolchain objects, the build of the 53-package locked closure and the `earlybird` package, and then RUNNING the produced binary. Both opam figures run from a stamp taken after checkout, through `setup-ocaml` (switch create and compiler install) and `opam install . --deps-only`, to the end of `dune build @install`.

setup-ocaml has a `cache: true` mode (the default) which caches a portion of the opam state in a GitHub Actions cache. The `nocache` measurements disable the GitHub Actions cache, mimicking desktops that also do not have access to that cache.

The four rows that are not a fresh checkout repeat across both opam columns, and are pooled over all eight runs. The cache holds the compiler and the switch, not this project's dependencies, so `opam install . --deps-only` costs about the same either way. Splitting those rows would publish noise as a distinction.
The `dk1-high-performance` branch stacks on this one and requires GitHub Actions to maintain a per-ABI datastore of built objects for the 53-package closure, so a consumer fetches every opam package object prebuilt:

<!--PERF:hpqs-pr1-->
| Step | dk High Performance (dk1-high-performance) | Quick Setup, for comparison |
| --- | --- | --- |
| Linux: fresh checkout to a runnable binary | ~2 m 16 s ±19% | ~3 m 1 s ±6% |
| Linux: re-run the built binary | ~7 s ±2% | ~7 s ±16% |
| Windows: fresh checkout to a runnable binary | ~9 m 33 s ±6% | ~9 m 2 s ±8% |
| Windows: re-run the built binary | ~19 s ±27% | ~18 s ±29% |
<!--/PERF:hpqs-pr1-->

## What's in the diff

- `dk0`/`dk1`/`dk0.cmd`/`dk1.cmd`: vendored self-installing launchers, pinned to dk engine **<!--VER:dk-->2.4.3.20<!--/VER:dk-->**
- `dk.u`: workspace script with the pinned `CommonsLang_OCaml 0.1.20260916234322` toolchain import and source-tree asset checksums
- `dune-project`, `earlybird.opam`: the build inputs the dk recipe consumes
- `dk-opam-pins.txt`, `dk.opam-lock.jsonc`: the solver pin table and the solved per-slot dependency lock
- `dk-src/dune-workspace`: the dune workspace root marker staged into the assembled source
- `src/adapter/state_initialized.ml`: the one source adjustment the build needs
- `etc/dk/v/NotHackwaly_Ocamlearlybird/*.values.jsonc`: the generated localized-source form, the generated one-line closure driver (`OpamBuild F_BuildLockedClosure@1.0.28`), and the generated thin final form exposing `bin/ocamlearlybird`
- `etc/dk/t/`: trust records (acceptances and capability grants) recorded by the quickstart from the recipe's declared trust statements
- `etc/dk/i/`: verified import records and the closure manifest
- `.github/workflows/measure-performance.yml`: the dk-and-opam timing matrix behind the table above
- `.github/workflows/repin-engine.yml`: repins the engine and `CommonsLang_OCaml` on a hosted runner
- `scripts/check-measurement-complete.mjs`, `scripts/expected-measurement.json`: the gate that fails the workflow if any expected slot's measurement is missing
- `.gitattributes`: LF policy on the dk assets. dk hashes raw bytes, so a CRLF checkout on Windows would break asset verification.
- `CLO.md`: the adoption guide

The change is additive. The existing dune/opam/esy workflows continue to work unchanged.
