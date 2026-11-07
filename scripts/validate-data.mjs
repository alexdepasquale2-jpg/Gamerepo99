#!/usr/bin/env node
/**
 * Hearthfall: The Last Spark — data validator (thin runner).
 * Table checks live under scripts/validate/.
 */
import { createBag } from './validate/util.mjs';
import { loadAll, REQUIRED_FILES } from './validate/load.mjs';
import { validateHooks } from './validate/hooks.mjs';
import { validateArchetypes } from './validate/archetypes.mjs';
import { validateMethods } from './validate/methods.mjs';
import { validateTraits } from './validate/traits.mjs';
import { validatePeopleTowns } from './validate/people-towns.mjs';
import { validateLinksEventsProofs } from './validate/links-events-proofs.mjs';
import { validateTimeRipples } from './validate/time-ripples.mjs';
import { validateLines } from './validate/lines.mjs';
import { validateKinshipLetters } from './validate/kinship-letters.mjs';
import { validateDoctrines } from './validate/doctrines.mjs';
import { validateWilderness } from './validate/wilderness.mjs';
import { validateRoadContent } from './validate/road-content.mjs';
import { validateHoarder } from './validate/hoarder.mjs';
import { validateScenarios } from './validate/scenarios.mjs';
import { validateDynamism } from './validate/dynamism.mjs';
import { validateFabricContent } from './validate/fabric-content.mjs';
import { validateInteractions } from './validate/interactions.mjs';
import { validateEconomyLod } from './validate/economy-lod.mjs';
import { validateSocialGraph } from './validate/social-graph.mjs';
import { validateUnspoken } from './validate/unspoken.mjs';
import { validateNames } from './validate/lines.mjs';

const { errors, warnings, req, ids } = createBag();
const data = loadAll(errors);
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}

req(!data['protagonist.json'], 'protagonist.json must be removed (use archetypes.json)');
for (const f of REQUIRED_FILES) req(!!data[f], `missing ${f}`);

const { hooks, hookById } = validateHooks(data, { req, ids });
const { methods, wounds, marks } = validateMethods(data, { req, ids, hooks, hookById });
const { archetypes, m2, towns, proofs } = validateArchetypes(data, { req, ids, hooks, hookById });
validateTraits(data, { req, ids, hooks, hookById, methods });
const people = ids(data['people.json']?.people);
const events = ids(data['events.json']?.events);
const links = ids(data['links.json']?.links);
validatePeopleTowns(data, { req, people, towns, wounds, proofs });
validateLinksEventsProofs(data, { req, people, towns, archetypes, wounds, marks, methods, events, proofs, links });
validateTimeRipples(data, { req, marks });
validateLines(data, { req, people, methods, marks });
validateKinshipLetters(data, { req, people, links });
validateNames(data, { req });
validateDoctrines(data, { req, towns, people, methods, hooks });
validateWilderness(data, { req, ids, towns, links, people, hooks });
validateRoadContent(data, { req, ids, people, towns });
validateHoarder(data, { req, ids, towns, hooks });
validateEconomyLod(data, { req, ids, towns });
validateSocialGraph(data, { req, people });
validateUnspoken(data, { req, ids, marks });
validateDynamism(data, { req, ids, people, methods });
validateFabricContent(data, { req, ids, people, methods });
validateInteractions(data, { req, ids, people, methods, marks });
validateScenarios(data, { req, ids, people, methods, marks, hooks, archetypes });

console.log('Files:', Object.keys(data).sort().join(', '));
console.log(
  'Counts:',
  `archetypes=${archetypes.size}`,
  `m2=[${m2.join(',')}]`,
  `hooks=${hooks.size}`,
  `people=${people.size}`,
  `methods=${methods.size}`,
  `links=${links.size}`
);
if (warnings.length) console.log('Warnings:\n ' + warnings.join('\n '));
if (errors.length) {
  console.error('FAILED:\n ' + errors.join('\n '));
  process.exit(1);
}
console.log('OK — protagonist system data valid (no unknown hooks).');
