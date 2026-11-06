/** Load authored people.json anchors for worldgen merge. Pure; no dyn/. */

import peopleJson from '../../data/people/people.json';
import type { PersonDraft } from './people';

type PersonRow = {
  id: string;
  authored?: boolean;
  anchor?: boolean;
  firstLine?: string;
};

function fpHex(n: number): string {
  return (n >>> 0).toString(16).padStart(8, '0');
}

function idFingerprint(id: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h = Math.imul(h ^ id.charCodeAt(i), 0x01000193) >>> 0;
  }
  return `pf-anchor-${fpHex(h)}`;
}

/**
 * Authored rows marked anchor/authored in people.json (Ashford cast today).
 * Stable table order; deterministic fingerprints. No dyn/.
 */
export function loadAuthoredAnchors(): PersonDraft[] {
  const rows = (peopleJson as { people?: PersonRow[] }).people ?? [];
  const out: PersonDraft[] = [];
  for (const row of rows) {
    if (!row?.id) continue;
    if (row.anchor !== true && row.authored !== true) continue;
    const draft: PersonDraft = {
      id: row.id,
      fingerprint: idFingerprint(row.id),
    };
    if (row.anchor === true) draft.anchor = true;
    if (row.authored === true) draft.authored = true;
    if (typeof row.firstLine === 'string' && row.firstLine.length > 0) {
      draft.lines = [
        {
          id: `line-anchor-${row.id}`,
          text: row.firstLine,
          source: 'fixed',
        },
      ];
    }
    out.push(draft);
  }
  return out;
}
