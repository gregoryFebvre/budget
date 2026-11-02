import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const SCRIPT = resolve('scripts/check-privacy.mjs');
const GITIGNORE = resolve('.gitignore');
const dirs: string[] = [];

/** Crée un mini-dépôt Git temporaire contenant les fichiers donnés. */
function repo(files: Record<string, string>, withGitignore = true): string {
  const dir = mkdtempSync(join(tmpdir(), 'budget-privacy-'));
  dirs.push(dir);
  execFileSync('git', ['init', '-q'], { cwd: dir });
  if (withGitignore) copyFileSync(GITIGNORE, join(dir, '.gitignore'));
  for (const [name, content] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, name)), { recursive: true });
    writeFileSync(join(dir, name), content);
  }
  return dir;
}
const run = (dir: string) => spawnSync('node', [SCRIPT, '--root', dir], { encoding: 'utf8' });

afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

describe('contrôle de confidentialité', () => {
  it('dépôt sain : succès', () => {
    const r = run(repo({ 'src/app.ts': 'export const x = 1;\n', 'package.json': '{"name":"x"}' }));
    expect(r.status).toBe(0);
  });

  it('le dépôt réel est sain', () => {
    const r = spawnSync('node', [SCRIPT], { encoding: 'utf8' });
    expect(r.stderr).toBe('');
    expect(r.status).toBe(0);
  });

  it('refuse un classeur Excel ou CSV', () => {
    expect(run(repo({ 'BUDGET.xls': 'x' })).status).toBe(0); // .xls ignoré par .gitignore → non versionné
    const r = run(repo({ 'données.numbers': 'x' }, false));
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('tableur/classeur interdit');
  });

  it('un fichier de sauvegarde ignoré par Git n\'est pas versionné (donc accepté)', () => {
    expect(run(repo({ 'budget-backup-2026-10-30.json': '{"app":"budget","schemaVersion":1}' })).status).toBe(0);
  });

  it('refuse une sauvegarde si .gitignore ne la protège pas, sans afficher son contenu', () => {
    const r = run(repo({ 'budget-backup-2026-10-30.json': '{"app":"budget","montant":98765}' }, false));
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('fichier de sauvegarde interdit');
    expect(r.stderr).not.toContain('98765');
    expect(r.stderr).toContain('motif de protection manquant');
  });

  it('refuse un JSON qui a la forme d\'une sauvegarde, même sous un autre nom', () => {
    const r = run(repo({ 'donnees/mon-budget.json': '{"app":"budget","schemaVersion":1,"data":{}}' }));
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('forme d\'une sauvegarde');
  });

  it('refuse un secret manifeste', () => {
    const r = run(repo({ 'src/config.ts': 'export const k = "ghp_abcdefghijklmnopqrstuvwxyz0123";\n' }));
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('secret');
  });

  it('refuse un appel réseau dans le code de l\'application, mais pas dans les tests', () => {
    expect(run(repo({ 'src/api.ts': 'fetch("/x");\n' })).status).toBe(1);
    expect(run(repo({ 'src/tests/mock.ts': 'fetch("/x");\n' })).status).toBe(0);
  });

  it('refuse un bundle de production contenant un appel réseau', () => {
    const dir = repo({ 'dist/assets/index.js': 'navigator.sendBeacon("/t")' });
    expect(run(dir).status).toBe(1);
  });
});
