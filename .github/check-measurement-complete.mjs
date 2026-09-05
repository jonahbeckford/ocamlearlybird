// THE MEASUREMENT COVERED EVERY SLOT IT CLAIMS TO COVER, OR THIS FAILS.
//
// WHY THIS EXISTS. The dk matrix in measure-performance.yml runs `fail-fast: false`,
// so one leg can die while the others finish and the workflow still completes with
// numbers. Those numbers then refresh CLO.md and both PR descriptions while silently
// describing a slot nobody measured. Nothing noticed that before this file.
//
// WHY IT IS NOT A TIMING THRESHOLD. Repeated runs at one pin put 6 of the 12 dk cells
// at or above 10 percent coefficient of variation, and the two cells quiet enough to
// carry a threshold were not the same two before and after an unrelated workflow
// repair. A threshold chosen on either sample rests on a property the next fix moves.
// A MISSING or FAILED measurement has no such dependence, and it is the failure that
// actually happened: the one real regression on record did not run slower, it did not
// build at all.
//
// WHAT IT ASSERTS. Every slot named in .github/expected-measurement.json reported
// every phase named there, with a numeric millisecond value greater than zero.
//
// IT PROVES ITSELF BEFORE IT IS TRUSTED. `--selftest` builds a complete fixture and a
// damaged one and requires this file to accept the first and reject the second. The
// gate job runs that before applying the check to real data, because a check that has
// only ever been observed passing is evidence about the run and not about the check.

import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const argv = process.argv.slice(2);
const KNOWN = new Set(["--expected", "--dir", "--selftest", "--help"]);
for (const a of argv) {
  if (a.startsWith("--") && !KNOWN.has(a)) {
    console.error(`FAIL  unknown flag ${a}. Known flags: ${[...KNOWN].join(", ")}`);
    process.exit(2);
  }
}
const opt = (name, dflt) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : dflt;
};

// A millisecond reading, without a backslash class. Digits only, at least one, and a
// value above zero. A phase that reported 0 ms did not run.
const isPositiveInteger = (s) => {
  if (typeof s !== "string" || s.length === 0) return false;
  for (const ch of s) {
    const c = ch.codePointAt(0);
    if (c < 0x30 || c > 0x39) return false;
  }
  return Number(s) > 0;
};

function readPhases(file) {
  const out = {};
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    out[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
  }
  return out;
}

function check(expectedFile, dir) {
  const spec = JSON.parse(fs.readFileSync(expectedFile, "utf8"));
  const slots = spec.slots ?? [];
  const phases = spec.phases ?? [];
  if (!slots.length || !phases.length) {
    return { failures: [`${expectedFile} declares ${slots.length} slot(s) and ${phases.length} phase(s); a declaration that expects nothing cannot be violated, so it is refused rather than passed`], checked: 0 };
  }
  const failures = [];
  let checked = 0;
  for (const slot of slots) {
    const file = path.join(dir, `${slot}.txt`);
    if (!fs.existsSync(file)) {
      failures.push(`slot ${slot} reported NO measurement at all: ${path.basename(file)} is absent. Its leg failed, was skipped, or was dropped from the matrix while this branch still claims to cover it.`);
      continue;
    }
    const got = readPhases(file);
    for (const p of phases) {
      checked += 1;
      if (!(p in got)) {
        failures.push(`slot ${slot} is MISSING phase ${p}: the leg ran and produced no reading for it.`);
      } else if (!isPositiveInteger(got[p])) {
        failures.push(`slot ${slot} phase ${p} is ${JSON.stringify(got[p])}, which is not a positive whole number of milliseconds.`);
      }
    }
  }
  return { failures, checked };
}

// ---------------------------------------------------------------- selftest
if (argv.includes("--selftest")) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "measgate-"));
  const expected = path.join(root, "expected.json");
  fs.writeFileSync(expected, JSON.stringify({ slots: ["A", "B"], phases: ["p1", "p2"] }));

  const good = path.join(root, "good");
  fs.mkdirSync(good);
  fs.writeFileSync(path.join(good, "A.txt"), "p1=10\np2=20\n");
  fs.writeFileSync(path.join(good, "B.txt"), "p1=30\np2=40\n");

  const missingSlot = path.join(root, "missing-slot");
  fs.mkdirSync(missingSlot);
  fs.writeFileSync(path.join(missingSlot, "A.txt"), "p1=10\np2=20\n");

  const missingPhase = path.join(root, "missing-phase");
  fs.mkdirSync(missingPhase);
  fs.writeFileSync(path.join(missingPhase, "A.txt"), "p1=10\n");
  fs.writeFileSync(path.join(missingPhase, "B.txt"), "p1=30\np2=40\n");

  const zero = path.join(root, "zero");
  fs.mkdirSync(zero);
  fs.writeFileSync(path.join(zero, "A.txt"), "p1=0\np2=20\n");
  fs.writeFileSync(path.join(zero, "B.txt"), "p1=30\np2=40\n");

  const cases = [
    ["a complete measurement is ACCEPTED", good, 0],
    ["a slot that reported nothing is REJECTED", missingSlot, 1],
    ["a slot missing one phase is REJECTED", missingPhase, 1],
    ["a phase reporting 0 ms is REJECTED", zero, 1],
  ];
  let bad = 0;
  for (const [name, dir, want] of cases) {
    const { failures } = check(expected, dir);
    const got = failures.length ? 1 : 0;
    const ok = got === want;
    if (!ok) bad += 1;
    console.log(`  ${ok ? "PASS" : "FAIL"}  selftest: ${name} (expected exit ${want}, got ${got})`);
    for (const f of failures) console.log(`          ${f}`);
  }
  fs.rmSync(root, { recursive: true, force: true });
  if (bad) {
    console.error(`FAIL  measurement_gate_selftest  ${bad} of ${cases.length} selftest case(s) behaved wrongly. The check is NOT trustworthy and the real result below must not be believed.`);
    process.exit(1);
  }
  console.log(`PASS  measurement_gate_selftest  ${cases.length} case(s): it accepts a complete measurement and rejects a missing slot, a missing phase and a zero reading.`);
  process.exit(0);
}

// ---------------------------------------------------------------- the check
const expectedFile = opt("--expected", ".github/expected-measurement.json");
const dir = opt("--dir", null);
if (!dir) {
  console.error("usage: check-measurement-complete.mjs --dir <phases-dir> [--expected <file>]");
  console.error("       check-measurement-complete.mjs --selftest");
  process.exit(2);
}
if (!fs.existsSync(dir)) {
  console.error(`FAIL  measurement_complete  the phases directory ${dir} does not exist, so NOTHING was collected. That is not the same as a measurement that passed.`);
  process.exit(1);
}

const { failures, checked } = check(expectedFile, dir);
for (const f of failures) console.log(`  FAIL  ${f}`);
if (failures.length) {
  console.error(`FAIL  measurement_complete  ${failures.length} problem(s). This branch declares its coverage in ${expectedFile}; either a leg did not report, or the declaration is stale. Fix the run or move the declaration in the same commit that changes the matrix.`);
  process.exit(1);
}
console.log(`PASS  measurement_complete  every declared slot reported every declared phase (${checked} reading(s) checked).`);
