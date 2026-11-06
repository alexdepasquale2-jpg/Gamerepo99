import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const dataDir = join(root, 'src', 'data');

/** Subfolders from Loom §5 / Tidy layout. Root still holds lines.json (+ legacy flats if any). */
const DATA_SUBDIRS = ['dialogue', 'people', 'world', 'economy', 'systems'];

const loadHooksDir = (dataDir, errors) => {
  const hooksDir = join(dataDir, 'hooks');
  const index = JSON.parse(readFileSync(join(hooksDir, 'index.json'), 'utf8'));
  const hooks = [];
  for (const name of index.files || []) {
    const part = JSON.parse(readFileSync(join(hooksDir, name), 'utf8'));
    hooks.push(...(part.hooks || []));
  }
  return { version: index.version, description: index.description, hooks };
};

function loadJsonFilesInDir(dir, files, errors) {
  for (const name of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    const full = join(dir, name);
    try {
      files[name] = JSON.parse(readFileSync(full, 'utf8'));
    } catch (e) {
      errors.push(`PARSE ${name}: ${e.message}`);
    }
  }
}

export const loadAll = (errors) => {
  const files = {};
  // Root-level JSON (lines.json, etc.)
  loadJsonFilesInDir(dataDir, files, errors);
  // Grouped folders — keyed by basename so REQUIRED_FILES stay stable
  for (const sub of DATA_SUBDIRS) {
    const dir = join(dataDir, sub);
    try {
      if (!statSync(dir).isDirectory()) continue;
    } catch {
      continue;
    }
    loadJsonFilesInDir(dir, files, errors);
  }
  try {
    files['hooks.json'] = loadHooksDir(dataDir, errors);
  } catch (e) {
    errors.push(`PARSE hooks/: ${e.message}`);
  }
  if (readdirSync(dataDir).includes('hooks.json')) {
    errors.push('hooks.json must be removed — use src/data/hooks/ split by category');
  }
  return files;
};

export const REQUIRED_FILES = [
  'archetypes.json',
  'traits.json',
  'hooks.json',
  'player.json',
  'methods.json',
  'wounds.json',
  'marks.json',
  'people.json',
  'towns.json',
  'links.json',
  'events.json',
  'proofs.json',
  'time.json',
  'ripples.json',
  'lines.json',
  'kinship.json',
  'letters.json',
  'doctrines.json',
  'biomes.json',
  'economy-resources.json',
  'facilities.json',
  'routes.json',
  'road-encounters.json',
  'travel-trades.json',
  'notoriety.json',
  'stash-sites.json',
  'patrons.json',
  'scenarios.json',
  'voice-anchors.json',
  'line-fragments.json',
  'reaction-curves.json',
  'voice-constraints.json',
];
