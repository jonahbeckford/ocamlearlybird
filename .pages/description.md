## What this branch does

Stacks on the `dk1-quick-setup` branch. This is the **High Performance** branch: a tag-driven CI pipeline ([`distribute-1.3.yml`](https://github.com/jonahbeckford/ocamlearlybird/blob/dk1-high-performance/.github/workflows/distribute-1.3.yml)) which requires GitHub Actions to maintain a per-ABI datastore of built objects for the 53-package closure, with the per-ABI object ids recorded in [`dist/any.u`](https://github.com/jonahbeckford/ocamlearlybird/blob/dk1-high-performance/dist/any.u). A consumer fetches every opam package object prebuilt:

```sh
# preseed the datastore and then run
./dk1 restore github-l2 jonahbeckford/ocamlearlybird
./dk1 run-object NotHackwaly_Ocamlearlybird.Ocamlearlybird@1.3.6 \
  -s Release.execution_abi -m ./bin/ocamlearlybird.exe -- --help=plain
```

See [CLO.md](https://github.com/jonahbeckford/ocamlearlybird/blob/dk1-high-performance/CLO.md) for the High Performance guide: publishing with `prepare-version` + `distribute`, the fast dev loop (opam venv), and the **What gets cached** table.

## Provenance

The dk packages this build depends on have been **100% AI generated and maintained since June 2026**, and the dk build tool itself was **hand built but AI assisted since June 2026**.

## Performance

Performance was measured on GitHub Actions runners with dk <!--VER:dk-->2.4.3.21<!--/VER:dk--> and opam 2.5.2 (`.github/workflows/measure-performance.yml`). The ± is the sample standard deviation over the mean; the High Performance numbers are the mean over 4 runs and the Quick Setup comparison numbers the mean over 8. The right column is the `dk1-quick-setup` branch's Quick Setup number for the same step:

<!--PERF:hpqs-pr2-->
| Step | dk High Performance | Quick Setup, for comparison |
| --- | --- | --- |
| Linux: fresh checkout to a runnable binary | ~1 m 40 s ±6% | ~3 m 7 s ±7% |
| Linux: re-run the built binary | ~6 s ±15% | ~7 s ±6% |
| Windows: fresh checkout to a runnable binary | ~2 m 18 s ±13% | ~8 m 48 s ±9% |
| Windows: re-run the built binary | ~14 s ±5% | ~17 s ±38% |
<!--/PERF:hpqs-pr2-->

**What each fresh checkout figure includes.** Both columns are the same one command, `./dk1 run-object ... -- --help=plain`, whose timed region covers the vendored launcher self-installing the engine pinned in `dk.u`, obtaining the 53-package locked closure and the `earlybird` package, and then RUNNING the produced binary. The difference is the high performance branch uses the `restore` command which makes available all ocamlearlybird dependencies that were prebuilt in the ocamlearlybird GitHub Actions.

## What's in the diff (beyond `dk1-quick-setup`)

- `.github/workflows/distribute-1.3.yml`: the build matrix (5 `distribute` slots and `combine`), dk engine `<!--VER:dk-->2.4.3.21<!--/VER:dk-->`, `trust-packages: CommonsLang_OCaml CommonsBase_FileMagic`
- `.github/workflows/measure-performance.yml`: the High Performance timing (dk restore + three `run-object` runs: fetch, reconcile, warm) and the datastore-compatibility guard
- `scripts/expected-measurement.json`: the slots the completeness gate requires, extended for the High Performance datastore
- `dk.u`: the added `CommonsBase_Std` and `CommonsBase_FileMagic` imports the datastore path needs
- `dist/any.u`: the distribution script with the 6 per-ABI object ids and per-ABI machine-type checks
- `DEMO-KEYS.md`: the public demo signing keys the release chain is signed with
- `etc/dk/d/1.3.0.dist.json`: the 1.3 distribution public keys
- `etc/dk/i/`: the `CommonsBase_FileMagic` and `CommonsBase_Std` import records and the closure manifest
- `etc/dk/v/…/Ocamlearlybird.DevPrefix.values.jsonc`: the driver behind the opam venv fast dev loop
- `CLO.md`: the **High Performance** and **Fast dev loop (opam venv)** sections and the High Performance column of **What gets cached**

## Signing caveat

The current release chain is signed with **public demo keys** (committed in `DEMO-KEYS.md`), suitable for evaluating the mechanism. A production release requires `./dk1 prepare-version --ci github 1.3` in a secure environment, replacing the `dk-distribution` environment secrets, and superseding the demo releases.
