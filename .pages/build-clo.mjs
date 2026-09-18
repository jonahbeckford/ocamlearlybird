// CLO.md renderer for the branch review Pages. Run from the .pages/ directory:
//   node build-clo.mjs <owner> <repo> <headBranch> <reviewHref> <outPath>
// Renders origin/<headBranch>:CLO.md (the adoption guide) to one self-contained
// static HTML page, styled to match the review pages, with a nav back to the
// index and the branch review. The repo checkout is the parent directory (..).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { marked } from 'marked';

const [owner, repo, head, reviewHref, outPath] = process.argv.slice(2);
if (!owner || !repo || !head || !reviewHref || !outPath) {
  console.error('usage: node build-clo.mjs <owner> <repo> <headBranch> <reviewHref> <outPath>');
  process.exit(2);
}
const git = (...a) => execFileSync('git', ['-C', '..', ...a], { encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 });

git('fetch', '-q', 'origin', head);
let md = '_(no CLO.md on this branch)_';
try { md = git('show', `origin/${head}:CLO.md`); } catch { /* leave default */ }

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const nav = `${owner}/${repo} &middot; <a href="index.html">index</a> &middot; `
  + `<a href="${esc(reviewHref)}">branch review</a> &middot; <code>${esc(head)}</code> CLO.md`;

const tpl = fs.readFileSync('clo-template.html', 'utf8')
  .split('<!--clo-title-->').join(`CLO.md · ${esc(head)}`)
  .split('<!--clo-nav-->').join(nav)
  .split('<!--clo-body-->').join(marked.parse(md));
fs.writeFileSync(outPath, tpl);
console.log(`wrote ${outPath}: CLO.md of ${head}`);
