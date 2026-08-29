import { createHash, randomUUID as nodeRandomUUID } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_PACKAGE_ROOT = path.resolve(HERE, '..');
const DEFAULT_REPO_ROOT = path.resolve(DEFAULT_PACKAGE_ROOT, '..');

/**
 * The runtime fingerprint covers the executable crawler entry points and every
 * JavaScript module below src/. The list is resolved and lexically sorted before
 * hashing so filesystem enumeration order cannot affect the result.
 */
export const CRAWLER_SOURCE_ROOTS = Object.freeze(['package.json', 'package-lock.json', 'index.mjs', 'mcp.mjs', 'src']);

const SHA256 = 'sha256';

function sha256(value) {
  return createHash(SHA256).update(value).digest('hex');
}

function sortedCrawlerSources(packageRoot, roots = CRAWLER_SOURCE_ROOTS) {
  const files = [];
  const visit = (relativePath) => {
    const absolutePath = sourcePath(packageRoot, relativePath);
    const stat = statSync(absolutePath);
    if (stat.isDirectory()) {
      for (const entry of readdirSync(absolutePath).sort()) {
        visit(path.posix.join(relativePath.replaceAll(path.sep, '/'), entry));
      }
      return;
    }
    if (stat.isFile() && (absolutePath.endsWith('.mjs') || absolutePath.endsWith('.json'))) {
      files.push(normalizeSourceFile(packageRoot, relativePath));
    }
  };

  for (const root of roots) visit(root);
  return [...new Set(files)].sort();
}

function normalizeSourceFile(packageRoot, file) {
  if (typeof file !== 'string' || file.length === 0) throw new TypeError('A crawler source file must be a non-empty string.');
  const absolutePath = path.resolve(packageRoot, file);
  const relativePath = path.relative(packageRoot, absolutePath);
  if (relativePath === '..' || relativePath.startsWith(`..${path.sep}`) || path.isAbsolute(relativePath)) {
    throw new Error(`Crawler source file escapes package root: ${file}`);
  }
  return relativePath.split(path.sep).join('/');
}

function sourcePath(packageRoot, relativePath) {
  const normalized = normalizeSourceFile(packageRoot, relativePath);
  return path.join(packageRoot, ...normalized.split('/'));
}

/** Extract the extension serializer that the crawler evaluates in the page. */
export function extractSerializerSource(backgroundSource) {
  const match = String(backgroundSource).match(/^async function elementSerializer\([\s\S]*?^\}$/m);
  if (!match) {
    throw new Error('Could not find elementSerializer in background.js.');
  }
  return match[0];
}

/** Digest the executable serializer only, excluding unrelated extension code. */
export function digestSerializerSource(backgroundSource) {
  return sha256(extractSerializerSource(backgroundSource));
}

export function readGitCommit(repoRoot = DEFAULT_REPO_ROOT) {
  try {
    const commit = execFileSync('git', ['-C', repoRoot, 'rev-parse', '--verify', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return commit || null;
  } catch {
    return null;
  }
}

/**
 * Hash a source set with unambiguous length-prefixing. The serializer digest is
 * part of the same fingerprint even though its source lives outside this package.
 */
export function fingerprintCrawlerSources({ packageRoot, sourceFiles, serializerDigest }) {
  const hash = createHash(SHA256);
  const add = (label, value) => {
    const bytes = Buffer.from(value);
    hash.update(`${label.length}:${label}:${bytes.length}:`);
    hash.update(bytes);
  };

  add('format', 'spec-crawler-source-v1');
  for (const relativePath of sourceFiles.map((file) => normalizeSourceFile(packageRoot, file)).sort()) {
    add(`source:${relativePath}`, readFileSync(sourcePath(packageRoot, relativePath)));
  }
  add('serializer-sha256', serializerDigest);
  return hash.digest('hex');
}

function isoTime(now) {
  const value = typeof now === 'function' ? now() : now;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new TypeError('Runtime start time must be a valid Date-compatible value.');
  return date.toISOString();
}

/**
 * Build runtime identity without mixing process-local values into reproducible
 * software identity. Dependencies are injectable so tests do not depend on git,
 * wall-clock time, process ids, or randomness.
 */
export function createRuntimeIdentity({
  packageRoot = DEFAULT_PACKAGE_ROOT,
  repoRoot = DEFAULT_REPO_ROOT,
  sourceFiles,
  sourceRoots = CRAWLER_SOURCE_ROOTS,
  backgroundPath = path.join(repoRoot, 'background.js'),
  gitCommit,
  mcpClient,
  mcpClientName,
  randomUUID = nodeRandomUUID,
  pid = process.pid,
  now = () => new Date(),
} = {}) {
  const packageJson = JSON.parse(readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
  if (typeof packageJson.name !== 'string' || typeof packageJson.version !== 'string') {
    throw new Error('package.json must contain string name and version fields.');
  }

  const documentedSourceFiles = [...new Set(sourceFiles
    ? sourceFiles.map((file) => normalizeSourceFile(packageRoot, file)).sort()
    : sortedCrawlerSources(packageRoot, sourceRoots))];
  const serializerDigest = digestSerializerSource(readFileSync(backgroundPath, 'utf8'));
  const deterministic = Object.freeze({
    package: Object.freeze({ name: packageJson.name, version: packageJson.version }),
    sourceFiles: Object.freeze([...new Set(documentedSourceFiles)]),
    serializerDigest,
    sourceFingerprint: fingerprintCrawlerSources({
      packageRoot,
      sourceFiles: documentedSourceFiles,
      serializerDigest,
    }),
    gitCommit: gitCommit === undefined ? readGitCommit(repoRoot) : (gitCommit || null),
  });
  const client = mcpClient ?? {
    name: mcpClientName ?? `${packageJson.name}-mcp`,
    version: packageJson.version,
  };

  return Object.freeze({
    deterministic,
    instance: Object.freeze({
      uuid: randomUUID(),
      pid,
      startedAt: isoTime(now),
    }),
    mcpClient: Object.freeze({ name: client.name, version: client.version }),
  });
}
