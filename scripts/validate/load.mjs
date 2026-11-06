import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const dataDir = join(root, 'src', 'data');

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

export const loadAll = (errors) => {
  const files = {};
  for (const name of readdirSync(dataDir).filter((f) => f.endsWith('.json'))) {
    try {
      files[name] = JSON.parse(readFileSync(join(dataDir, name), 'utf8'));
    } catch (e) {
      errors.push(`PARSE ${name}: ${e.message}`);
    }
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
];
