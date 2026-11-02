#!/usr/bin/env node
/**
 * Contrôle de confidentialité avant publication sur un dépôt PUBLIC.
 * Vérifie les fichiers qui seraient versionnés (suivis ou non ignorés) :
 *   1. aucun classeur / tableur (xlsx, xls, ods, csv…) ;
 *   2. aucun fichier de sauvegarde ou d'environnement (*backup*.json, .env) ;
 *   3. aucun JSON ayant la forme d'une sauvegarde Budget ;
 *   4. aucun secret manifeste (clés privées, jetons) ;
 *   5. aucun appel réseau dans le code source de l'application ;
 *   6. un .gitignore qui protège les fichiers sensibles ;
 *   7. si un build existe (dist/), aucun appel réseau dans le bundle.
 * Le script n'affiche JAMAIS le contenu des fichiers, seulement leur chemin et la règle violée.
 *
 * Usage : npm run check:privacy        (ou : node scripts/check-privacy.mjs --root <dossier>)
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, extname, join, relative, sep } from 'node:path';

const rootArg = process.argv.indexOf('--root');
const root = rootArg > -1 ? process.argv[rootArg + 1] : process.cwd();

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'coverage']);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(relative(root, full));
  }
  return out;
}

function listFiles() {
  if (existsSync(join(root, '.git'))) {
    try {
      const out = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root, encoding: 'utf8' });
      return out.split('\0').filter(Boolean);
    } catch {
      /* repli sur le parcours du dossier */
    }
  }
  return walk(root);
}

const FORBIDDEN_EXT = new Set(['.xlsx', '.xlsm', '.xls', '.ods', '.csv', '.numbers']);
const JSON_ALLOWED = /^(package(-lock)?|tsconfig(\..+)?)\.json$/;
const BINARY_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.woff', '.woff2', '.ttf', '.zip', '.pdf']);
const SECRET_PATTERNS = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\bghp_[A-Za-z0-9]{20,}/,
  /\bgithub_pat_[A-Za-z0-9_]{20,}/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bsk-[A-Za-z0-9]{20,}/,
  /(api[_-]?key|secret|passw(or)?d|token)\s*[:=]\s*['"][^'"\s]{8,}['"]/i,
];
const NETWORK = /\bfetch\s*\(|XMLHttpRequest|sendBeacon|new\s+WebSocket|new\s+EventSource/;
const REQUIRED_IGNORES = ['node_modules', 'dist', '*.xlsx', 'budget-backup-', '.env'];

const problems = [];
const flag = (file, rule) => problems.push(`${file.split(sep).join('/')} — ${rule}`);
const files = listFiles();

function readText(file) {
  try {
    const full = join(root, file);
    if (statSync(full).size > 2 * 1024 * 1024) return null;
    return readFileSync(full, 'utf8');
  } catch {
    return null;
  }
}

for (const file of files) {
  const base = basename(file);
  const ext = extname(file).toLowerCase();
  const normalized = file.split(sep).join('/');

  if (FORBIDDEN_EXT.has(ext)) flag(file, 'tableur/classeur interdit (données potentiellement personnelles)');
  if (ext === '.json' && /backup|sauvegarde/i.test(base)) flag(file, 'fichier de sauvegarde interdit');
  if (/^\.env/.test(base) && base !== '.env.example') flag(file, 'fichier d\'environnement interdit');
  if (BINARY_EXT.has(ext)) continue;

  const text = readText(file);
  if (text === null) continue;

  if (ext === '.json' && !JSON_ALLOWED.test(base) && (/"app"\s*:\s*"budget"/.test(text) || /"schemaVersion"\s*:/.test(text))) {
    flag(file, 'JSON ayant la forme d\'une sauvegarde Budget');
  }
  if (base !== 'check-privacy.mjs' && base !== 'package-lock.json' && !normalized.startsWith('src/tests/')) {
    if (SECRET_PATTERNS.some((re) => re.test(text))) flag(file, 'secret ou identifiant manifeste');
  }
  if (normalized.startsWith('src/') && !normalized.startsWith('src/tests/') && /\.(ts|tsx)$/.test(file) && NETWORK.test(text)) {
    flag(file, 'appel réseau dans le code de l\'application (fetch, XMLHttpRequest, WebSocket…)');
  }
}

const gitignore = existsSync(join(root, '.gitignore')) ? readFileSync(join(root, '.gitignore'), 'utf8') : '';
for (const pattern of REQUIRED_IGNORES) {
  if (!gitignore.includes(pattern)) flag('.gitignore', `motif de protection manquant : ${pattern}`);
}

const assets = join(root, 'dist', 'assets');
if (existsSync(assets)) {
  for (const name of readdirSync(assets).filter((n) => n.endsWith('.js'))) {
    const text = readFileSync(join(assets, name), 'utf8');
    if (NETWORK.test(text)) flag(`dist/assets/${name}`, 'appel réseau dans le bundle de production');
  }
}

if (problems.length) {
  console.error(`✗ Contrôle de confidentialité : ${problems.length} problème(s)\n`);
  for (const p of problems) console.error(`  - ${p}`);
  console.error('\nNe publiez pas ce dépôt avant correction.');
  process.exit(1);
}
console.log(`✓ Contrôle de confidentialité : ${files.length} fichier(s) vérifié(s), aucun problème.`);
