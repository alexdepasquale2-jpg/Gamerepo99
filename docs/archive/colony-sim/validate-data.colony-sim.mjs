#!/usr/bin/env node
/**
 * Validates src/data/*.json: parse + cross-reference id resolution.
 * Usage: node scripts/validate-data.mjs
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = join(root, 'src', 'data');
const errors = [];
const warnings = [];

function loadAll() {
  const files = {};
  for (const name of readdirSync(dataDir).filter((f) => f.endsWith('.json'))) {
    const path = join(dataDir, name);
    try {
      files[name] = JSON.parse(readFileSync(path, 'utf8'));
    } catch (e) {
      errors.push(`PARSE ${name}: ${e.message}`);
    }
  }
  return files;
}

function idsFrom(arr, key = 'id') {
  return new Set((arr || []).map((x) => x[key]));
}

const data = loadAll();
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}

const resources = idsFrom(data['resources.json']?.resources);
const recipes = idsFrom(data['recipes.json']?.recipes);
const buildings = idsFrom(data['buildings.json']?.buildings);
const jobs = idsFrom(data['jobs.json']?.jobs);
const weather = idsFrom(data['weather.json']?.weather);
const seasons = idsFrom(data['seasons.json']?.seasons);
const events = idsFrom(data['events.json']?.events);
const traits = idsFrom(data['traits.json']?.traits);
const needs = idsFrom(data['needs.json']?.needs);
const phases = idsFrom(data['day_phases.json']?.phases);

// recipes → resources, stations
for (const r of data['recipes.json']?.recipes || []) {
  if (r.station && !buildings.has(r.station)) {
    errors.push(`recipes.json ${r.id}: station "${r.station}" not in buildings`);
  }
  for (const side of ['inputs', 'outputs']) {
    for (const io of r[side] || []) {
      if (!resources.has(io.resourceId)) {
        errors.push(`recipes.json ${r.id}: ${side} resource "${io.resourceId}" missing`);
      }
    }
  }
  if (r.placeAsBuilding && !buildings.has(r.placeAsBuilding)) {
    errors.push(`recipes.json ${r.id}: placeAsBuilding "${r.placeAsBuilding}" missing`);
  }
}

// buildings → resources, recipes
for (const b of data['buildings.json']?.buildings || []) {
  for (const c of [...(b.cost || []), ...(b.altCost || [])]) {
    if (!resources.has(c.resourceId)) {
      errors.push(`buildings.json ${b.id}: cost resource "${c.resourceId}" missing`);
    }
  }
  for (const rid of b.stationRecipes || []) {
    if (!recipes.has(rid)) {
      errors.push(`buildings.json ${b.id}: stationRecipes "${rid}" missing`);
    }
  }
  if (b.fuelResourceId && !resources.has(b.fuelResourceId)) {
    errors.push(`buildings.json ${b.id}: fuelResourceId "${b.fuelResourceId}" missing`);
  }
}

// jobs → needs, resources, buildings
for (const j of data['jobs.json']?.jobs || []) {
  for (const d of j.needDrives || []) {
    if (!needs.has(d.needId) && d.needId !== 'mood') {
      // mood is under needs.mood object, allow
      if (d.needId !== 'mood') errors.push(`jobs.json ${j.id}: needDrive "${d.needId}" missing`);
    }
  }
  if (j.fuelResourceId && !resources.has(j.fuelResourceId)) {
    errors.push(`jobs.json ${j.id}: fuelResourceId missing`);
  }
  if (j.requiresBuilding && j.requiresBuilding !== 'station' && !buildings.has(j.requiresBuilding)) {
    errors.push(`jobs.json ${j.id}: requiresBuilding "${j.requiresBuilding}" missing`);
  }
}

// seasons → weather
for (const s of data['seasons.json']?.seasons || []) {
  for (const wid of Object.keys(s.weatherWeights || {})) {
    if (!weather.has(wid)) {
      errors.push(`seasons.json ${s.id}: weatherWeights "${wid}" missing`);
    }
  }
}

// events → seasons, resources, weather
for (const ev of data['events.json']?.events || []) {
  for (const sid of ev.seasonBias || []) {
    if (!seasons.has(sid) && sid !== 'storm') {
      // allow weather id in bias as soft tag
      if (!weather.has(sid)) {
        warnings.push(`events.json ${ev.id}: seasonBias "${sid}" not a season (may be tag)`);
      }
    }
  }
  for (const fx of ev.effects || []) {
    if (fx.resourceId && !resources.has(fx.resourceId)) {
      errors.push(`events.json ${ev.id}: effect resource "${fx.resourceId}" missing`);
    }
    if (fx.target === 'weather.force' && typeof fx.value === 'string' && !weather.has(fx.value)) {
      errors.push(`events.json ${ev.id}: weather.force "${fx.value}" missing`);
    }
  }
}

// map → resources, seasons
const map = data['map.json'];
if (map) {
  for (const [season, nodes] of Object.entries(map.nodeTables || {})) {
    if (!seasons.has(season)) errors.push(`map.json nodeTables season "${season}" missing`);
    for (const n of nodes) {
      if (!resources.has(n.resourceId)) {
        errors.push(`map.json nodeTables ${season}: resource "${n.resourceId}" missing`);
      }
    }
  }
  for (const ir of map.starting?.initialResources || []) {
    if (!resources.has(ir.resourceId)) {
      errors.push(`map.json starting resource "${ir.resourceId}" missing`);
    }
  }
}

// resources placeAsBuilding
for (const r of data['resources.json']?.resources || []) {
  if (r.placeAsBuilding && !buildings.has(r.placeAsBuilding)) {
    errors.push(`resources.json ${r.id}: placeAsBuilding "${r.placeAsBuilding}" missing`);
  }
}

// day phase coverage
const ticks = new Set();
for (const p of data['day_phases.json']?.phases || []) {
  for (let t = p.tickStart; t <= p.tickEnd; t++) ticks.add(t);
}
const ticksPerDay = data['seasons.json']?.ticksPerDay ?? 48;
for (let t = 0; t < ticksPerDay; t++) {
  if (!ticks.has(t)) errors.push(`day_phases.json: tick ${t} not covered`);
}

console.log('Files:', Object.keys(data).sort().join(', '));
console.log(
  'Counts:',
  `resources=${resources.size}`,
  `recipes=${recipes.size}`,
  `buildings=${buildings.size}`,
  `jobs=${jobs.size}`,
  `weather=${weather.size}`,
  `seasons=${seasons.size}`,
  `events=${events.size}`,
  `traits=${traits.size}`,
  `needs=${needs.size}`,
  `phases=${phases.size}`
);
if (warnings.length) {
  console.log('Warnings:\n ' + warnings.join('\n '));
}
if (errors.length) {
  console.error('FAILED:\n ' + errors.join('\n '));
  process.exit(1);
}
console.log('OK — all JSON parsed; cross-references resolved.');
