import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const dataDir = join(root, 'src', 'data');

/** Resolve a path under src/data (grouped subfolders only; no flat fallback). */
export function resolveDataFile(...parts) {
  if (parts.length === 0) {
    throw new Error('resolveDataFile requires at least one path segment');
  }
  return join(dataDir, ...parts);
}

/** Subfolders from Loom §5 / Tidy layout. Root still holds lines.json until Task G. */
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

/** Assemble systems/scenarios/*.json into the virtual scenarios.json blob. */
const loadScenariosDir = (dataDir, errors) => {
  const scenariosDir = join(dataDir, 'systems', 'scenarios');
  const index = JSON.parse(readFileSync(join(scenariosDir, 'index.json'), 'utf8'));
  const scenarios = [];
  for (const name of index.files || []) {
    const part = JSON.parse(readFileSync(join(scenariosDir, name), 'utf8'));
    scenarios.push(part);
  }
  const { files: _files, ...meta } = index;
  return { ...meta, scenarios };
};

/** Assemble dialogue/fragments/** into virtual line-fragments.json (order via fragmentIds). */
const loadFragmentsDir = (dataDir, errors) => {
  const fragDir = join(dataDir, 'dialogue', 'fragments');
  const index = JSON.parse(readFileSync(join(fragDir, 'index.json'), 'utf8'));
  const byId = new Map();
  for (const name of index.files || []) {
    const part = JSON.parse(readFileSync(join(fragDir, name), 'utf8'));
    for (const frag of part.fragments || []) {
      if (byId.has(frag.id)) {
        errors.push(`DUP fragment id ${frag.id} in dialogue/fragments/`);
      }
      byId.set(frag.id, frag);
    }
  }
  const ids = [];
  if (Array.isArray(index.orderFiles) && index.orderFiles.length) {
    for (const name of index.orderFiles) {
      const part = JSON.parse(readFileSync(join(fragDir, name), 'utf8'));
      ids.push(...(part.fragmentIds || []));
    }
  } else if (Array.isArray(index.fragmentIds)) {
    ids.push(...index.fragmentIds);
  } else {
    ids.push(...byId.keys());
  }
  const fragments = [];
  for (const id of ids) {
    const frag = byId.get(id);
    if (!frag) {
      errors.push(`Missing fragment id ${id} listed in dialogue/fragments/ order`);
      continue;
    }
    fragments.push(frag);
  }
  if (byId.size !== fragments.length) {
    errors.push(
      `fragmentIds length ${fragments.length} != unique fragments loaded ${byId.size}`,
    );
  }
  const { files: _f, fragmentIds: _ids, orderFiles: _of, ...meta } = index;
  return { ...meta, fragments };
};

/** Assemble systems/assertions/ into virtual assertions.json (cases via caseIds). */
const loadAssertionsDir = (dataDir, errors) => {
  const dir = join(dataDir, 'systems', 'assertions');
  const index = JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8'));
  let rules = [];
  const byId = new Map();
  for (const name of index.files || []) {
    const part = JSON.parse(readFileSync(join(dir, name), 'utf8'));
    if (Array.isArray(part.rules)) rules = part.rules;
    for (const c of part.cases || []) {
      if (byId.has(c.id)) errors.push(`DUP assertion case ${c.id}`);
      byId.set(c.id, c);
    }
  }
  const ids = index.caseIds || [...byId.keys()];
  const cases = [];
  for (const id of ids) {
    const c = byId.get(id);
    if (!c) {
      errors.push(`Missing assertion case ${id} in systems/assertions/`);
      continue;
    }
    cases.push(c);
  }
  const { files: _f, caseIds: _ids, ...meta } = index;
  return { ...meta, rules, cases };
};

/** Assemble world/history/ into virtual history-tables.json. */
const loadHistoryDir = (dataDir, errors) => {
  const dir = join(dataDir, 'world', 'history');
  const index = JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8'));
  const out = {};
  const { files: fileList, historyBeatsFiles, ...meta } = index;
  Object.assign(out, meta);
  for (const name of fileList || []) {
    const part = JSON.parse(readFileSync(join(dir, name), 'utf8'));
    for (const [k, v] of Object.entries(part)) {
      if (k === 'historyBeats') continue; // assembled below in order
      if (out[k] !== undefined && k !== 'version' && k !== 'spec') {
        errors.push(`DUP history key ${k} in ${name}`);
      }
      out[k] = v;
    }
  }
  const beatFiles = historyBeatsFiles || (fileList || []).filter((n) => n.startsWith('historyBeats'));
  const historyBeats = [];
  for (const name of beatFiles) {
    const part = JSON.parse(readFileSync(join(dir, name), 'utf8'));
    historyBeats.push(...(part.historyBeats || []));
  }
  out.historyBeats = historyBeats;
  return out;
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
  try {
    files['scenarios.json'] = loadScenariosDir(dataDir, errors);
  } catch (e) {
    errors.push(`PARSE systems/scenarios/: ${e.message}`);
  }
  try {
    files['line-fragments.json'] = loadFragmentsDir(dataDir, errors);
  } catch (e) {
    errors.push(`PARSE dialogue/fragments/: ${e.message}`);
  }
  try {
    files['assertions.json'] = loadAssertionsDir(dataDir, errors);
  } catch (e) {
    errors.push(`PARSE systems/assertions/: ${e.message}`);
  }
  try {
    files['history-tables.json'] = loadHistoryDir(dataDir, errors);
  } catch (e) {
    errors.push(`PARSE world/history/: ${e.message}`);
  }
  // Monoliths must not coexist with split dirs
  const systemsDir = join(dataDir, 'systems');
  const dialogueDir = join(dataDir, 'dialogue');
  const worldDir = join(dataDir, 'world');
  try {
    if (readdirSync(systemsDir).includes('scenarios.json')) {
      errors.push('systems/scenarios.json must be removed — use systems/scenarios/ one file per scenario');
    }
    if (readdirSync(systemsDir).includes('assertions.json')) {
      errors.push('systems/assertions.json must be removed — use systems/assertions/');
    }
  } catch { /* missing */ }
  try {
    if (readdirSync(dialogueDir).includes('line-fragments.json')) {
      errors.push('dialogue/line-fragments.json must be removed — use dialogue/fragments/');
    }
  } catch { /* missing */ }
  try {
    if (readdirSync(worldDir).includes('history-tables.json')) {
      errors.push('world/history-tables.json must be removed — use world/history/');
    }
  } catch { /* missing */ }
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
  'assertions.json',
  'history-tables.json',
];
