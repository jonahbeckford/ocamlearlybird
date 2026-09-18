// CI branch-review builder (PR-independent). Run from the .pages/ directory:
//   node build-review.mjs <owner> <repo> <headBranch> <baseBranch> <outPath>
// Reads the review description from origin/<headBranch>:.pages/description.md and
// renders the net diff origin/<baseBranch>..origin/<headBranch> to one static
// self-contained HTML page. The repo checkout is the parent directory (..).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { marked } from 'marked';

const [owner, repo, head, base, outPath] = process.argv.slice(2);
if (!owner || !repo || !head || !base || !outPath) {
  console.error('usage: node build-review.mjs <owner> <repo> <headBranch> <baseBranch> <outPath>');
  process.exit(2);
}
const sh = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 });
const git = (...a) => sh('git', ['-C', '..', ...a]);

git('fetch', '-q', 'origin', base, head);
const baseSha = git('rev-parse', `origin/${base}`).trim();
const tip = git('rev-parse', `origin/${head}`).trim();

// Description from the committed file on the branch (no PR dependency).
let bodyMd = '_(no description)_';
try { bodyMd = git('show', `origin/${head}:.pages/description.md`); } catch { /* leave default */ }

// Net diff, minus the review tooling itself (kept in the branch but off the review).
const EXCLUDE = (p) => p.startsWith('.pages/') || p === '.github/workflows/pages.yml';
const rawDiff = git('diff', `${baseSha}..${tip}`);
const kept = rawDiff.split(/(?=^diff --git )/m).filter((sec) => {
  const m = sec.match(/^diff --git a\/\S+ b\/(\S+)/);
  return !m || !EXCLUDE(m[1]);
});
fs.writeFileSync('diff.patch', kept.join(''));

const files = git('diff', '--name-only', `${baseSha}..${tip}`).trim().split('\n').filter(Boolean).filter((p) => !EXCLUDE(p));
const fileLinks = files.map((f) =>
  `<li><a href="https://github.com/${owner}/${repo}/blob/${tip}/${f}" target="_blank" rel="noopener">${f}</a></li>`).join('\n');

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const meta = `${owner}/${repo} &middot; <code>${esc(head)}</code> vs <code>${esc(base)}</code> `
  + `&middot; net diff <code>${baseSha.slice(0, 9)}..${tip.slice(0, 9)}</code> &middot; ${files.length} files `
  + `&middot; generated ${new Date().toISOString().replace('T', ' ').slice(0, 16)}Z`;
// One rendered CLO.md (the High Performance guide) covers all three modes, so
// every review page links to it.
const cloLink = `<a href="high-performance-clo.html">Read the full CLO.md adoption guide &rarr;</a>`;
const tpl = fs.readFileSync('review-template.html', 'utf8')
  .split('<!--review-title-->').join(`Branch Review: ${esc(head)}`)
  .split('<!--review-meta-->').join(meta)
  .split('<!--review-clo-link-->').join(cloLink)
  .split('<!--review-prbody-->').join(marked.parse(bodyMd))
  .split('<!--review-filelinks-->').join(fileLinks);
fs.writeFileSync('prefilled-template.html', tpl);

const d2h = new URL('./node_modules/diff2html-cli/bin/diff2html.js', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
sh(process.execPath, [d2h, '-s', 'side', '--su', 'open', '-d', 'word', '-i', 'file',
  '--hwt', 'prefilled-template.html', '-F', outPath, '--', 'diff.patch']);

// Inline any CDN stylesheet the renderer links (self-contained page).
let html = fs.readFileSync(outPath, 'utf8');
for (const m of [...html.matchAll(/<link\s+rel="stylesheet"\s+href="(https?:\/\/[^"]+)"([^>]*)\/?>/g)]) {
  const [tag, href, rest] = m;
  const media = (rest.match(/media="([^"]+)"/) || [, ''])[1];
  try {
    const css = await (await fetch(href)).text();
    html = html.replace(tag, `<style${media ? ` media="${media}"` : ''}>\n${css}\n</style>`);
  } catch { /* leave the CDN link */ }
}
fs.writeFileSync(outPath, html);
console.log(`wrote ${outPath}: ${files.length} files, net ${baseSha.slice(0, 9)}..${tip.slice(0, 9)}`);
