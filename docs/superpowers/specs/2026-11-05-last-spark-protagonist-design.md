# Hearthfall: The Last Spark — Protagonist Identity Brainstorm

**Date:** 2026-11-05  
**Author:** Loom (systems)  
**Status:** PENDING ALEX REVIEW — top pick not locked  
**Context:** Pivot away from abstract “walking spark” and from any colony-sim framing. The player is **one being who lives inside** a world that is losing its will to live. Pillars retained: reignite people via costly methods; savage but human; marks & relapse; persistent world with **cross-town ripples**.

---

## 1. Project context (explored)

- Existing Last Spark loop (methods × wounds × marks × spark burnout) is sound and should survive.
- Colony-sim draft is archived; do not revive pawn management.
- Forge owns `STRUCTURE.md` (pure `src/sim/`, Phaser view-only). Protagonist must be data + sim rules, not a new engine genre.
- Alex via Niblet: “anything goes” for who the player is — person from a colony, lonely ogre, family of basilisks, etc.
- Need a **distinctive** fantasy that changes movement, access, method feel, spark meaning, discovery, and burnout — not a reskin.

**Success criteria for a pick**

1. Instantly readable fantasy in one sentence.  
2. Changes at least three loop verbs (move / access / method / cost / discover / burn out).  
3. Supports savage-but-human tone without requiring comedy OR grimdark only.  
4. Enables cross-town procedural links (rumor, roads, trade, fear, care).  
5. Buildable in M2 without a second protagonist pipeline.

---

## 2. Clarifying assumptions (made explicitly; Alex may override)

| Question | Assumption used for this draft |
|----------|--------------------------------|
| Single body or multi? | Prefer single-body for M2 clarity; multi allowed as alternate |
| Human-scale map? | 32px tiles; non-human may use size rules |
| Start location | Lives *between* or *in* Ashford region — not an angel dropping in |
| Tone risk | Prefer tragic/tender monster or compromised human over gag protagonist |

---

## 3. Options (8 identities)

### A — Marrow the Lonely Ogre *(recommended)*

**Core fantasy:** You are an ogre who kept a hearth when the world went quiet. Towns fear your silhouette; you fear becoming as still as they are.

**Loop changes**

- **Movement:** Slow; cannot enter through front doors (`size: large`). Use lanes, broken walls, river fords. Travel between towns on **ogre paths** (procedural edges).  
- **Access:** High fear → people may hide (extra tick to approach) OR stalled folk are too numb to run — monster privilege. Softens as town vitality rises.  
- **Methods:** Challenge = presence/roar contest; Shame = throw their disgust back; Carry = *literally* haul carts, bodies, beams (best labor); Inspire = show carved toys / cave garden (costly, rare, devastatingly human); Lie = “I’m just a big man.”  
- **Spark:** The coal in your chest / cave hearth. Feeding it = rest at your den between towns.  
- **Discovery:** Find dens, shortcuts, and “fear roads” that humans don’t use; overhear from outside windows.  
- **Burnout:** You sit down in your cave and do not get up. Towns tell stories of a hill that used to snore.

**Risks:** Tone can tip cartoon; must keep Marrow specific and sad, not Shrek-bit. Size rules add engineering. Kindness may read as “monster wants friends” cliché — counter with savage efficacy and loneliness tax.

---

### B — Ivy Quill, the Ledger Clerk *(alternate)*

**Core fantasy:** You copied everyone’s debts and secrets for the county. The world quit; your ink did not. You reignite people with what you know.

**Loop changes**

- **Movement:** Human-normal; offices and back rooms unlock via **keys/ledgers**.  
- **Access:** Social graph — know who hurts whom; start with dossier stubs on each person.  
- **Methods:** Shame/Lie strong (facts as weapons); Inspire via proof documents; Carry = run errands from the ledger; Challenge = confront with recorded failure.  
- **Spark:** Will to keep writing true things; lies cost ink/integrity meter.  
- **Discovery:** Cross-town **correspondence** — letters ripple faster than feet.  
- **Burnout:** You close the book mid-sentence and never open another.

**Risks:** Can collapse into dialogue/info UI. Less “anything goes” spectacle. Feels closer to a normal adventure protag.

---

### C — The Basilisk Brood *(alternate)*

**Core fantasy:** Three small basilisk siblings share one spark. The world went soft-eyed; your gaze still means something — carefully.

**Loop changes**

- **Movement:** Swap active body; one body per town possible (split party).  
- **Access:** Tiny bodies enter vents/windows; gaze can stun (method gate).  
- **Methods:** Challenge = locked gaze; Shame = reflect their stillness; Carry = coordinated haul; Inspire = shed-skin gift; Lie = mimic human speech poorly.  
- **Spark:** Shared pool — any sibling’s burnout risks all.  
- **Discovery:** Parallel scouting across towns same day.  
- **Burnout:** Brood goes stone-still; statues in three places.

**Risks:** Multi-entity UI/sim complexity for M2; tone can go cute or horror without a middle. Gaze as combat temptation.

---

### D — Sister Ember (traveling midwife)

**Core fantasy:** You deliver beginnings in a world that stopped wanting them.

**Loop:** Care-authority access; Carry/Inspire strong; Shame feels like betrayal of oath; spark = sleep debt; burnout = you refuse the next knock forever.  
**Risks:** Overlaps Nora NPC; medical fantasy may soften savage pillar.

---

### E — Rook Hale (the quitter who came back)

**Core fantasy:** You already burned out once. Something clawed a second coal into you. You know the lose state from the inside.

**Loop:** Start with a permanent mark `ash_memory`; savage methods cheaper; kind methods restore *others* more than you; burnout shows visions of your first quitting.  
**Risks:** Meta-heavy; harder for players who didn’t fail yet; dark in a samey way.

---

### F — Bellamy Mute (the bellringer)

**Core fantasy:** You rang hours for a town that stopped needing time. You cannot speak; methods are rung patterns and hauled ropes.

**Loop:** No dialogue at all (on-brand); Challenge/Inspire via bells heard cross-town; discovery = acoustic range.  
**Risks:** Expressiveness ceiling; may feel gimmick; accessibility of intent UI.

---

### G — Ash-Widow Bren (ex-colony mill spouse)

**Core fantasy:** You lived in the workers’ row when the mill was a colony of shifts and shared bread. You are the one person from that “colony” who kept walking.

**Loop:** Human access + kinship links; Carry across old coworkers; cross-town via mill routes.  
**Risks:** Name “colony” confuses with old genre; fantasy less sharp than ogre/brood.

---

### H — The Scar-Vessel

**Core fantasy:** When you mark others, a copy burns into your skin. You are becoming a ledger of how people were saved.

**Loop:** Methods apply marks to *you* too; spark recovery tied to wearing scars; burnout = you crack.  
**Risks:** Abstract; UI for self-marks; can punish engagement.

---

## 4. Comparison snapshot

| ID | Distinctiveness | M2 build cost | Tone fit | Cross-town hook |
|----|-----------------|---------------|----------|-----------------|
| A Ogre | ★★★★★ | Medium (size/fear) | Excellent if kept tender-savage | Fear roads, rumor, den network |
| B Clerk | ★★★☆☆ | Low | Strong | Letters / dossiers |
| C Brood | ★★★★★ | High | Risky | Split bodies |
| D Midwife | ★★★☆☆ | Low | Soft lean | Patient calls |
| E Quitter | ★★★★☆ | Medium | Strong | Memory echoes |
| F Mute | ★★★★☆ | Medium | Strong | Bell range |
| G Mill spouse | ★★☆☆☆ | Low | Fine | Work routes |
| H Scar-Vessel | ★★★★☆ | Medium | Strong | Scar-rumor |

---

## 5. Recommendation

### Top pick: **A — Marrow the Lonely Ogre**

**Why**

1. Best matches Alex’s “anything goes” brief without abandoning human tone — an ogre trying (and failing, and succeeding) at humanity *is* the theme.  
2. Changes the loop concretely: size movement, fear access, literal Carry, den-based spark recovery, rumor as cross-town physics.  
3. Burnout image is unforgettable and on-theme (you become landscape).  
4. Still ships in one M2 push if fear/size are simple flags, not full stealth AI.  
5. Differentiates Hearthfall from “empath RPG” and from the archived colony sim at a glance.

### Alternate 1: **B — Ivy Quill**

Safest engineering; sharpest social tools; if ogre tone worries Alex, clerk keeps every pillar with less art risk.

### Alternate 2: **C — Basilisk Brood**

Highest originality; choose if Alex wants the weirder showcase and accepts multi-body scope creep (or a M3 brood upgrade from ogre lessons).

---

## 6. Design sketch for top pick (Marrow) — pending approval

See also root `docs/DESIGN.md` (built around Marrow, marked pending).

**Identity data:** `protagonist.json` + `player.json` economy fields.  
**Home:** Den node on the overworld between Ashford and Lowmere.  
**Fear:** `approachTicks` extra while town vitality low; decays as you leave genuine_growth marks.  
**Loneliness tax:** After kind success, if nobody “stays near” by dusk, −2 spark (they warm to life, not necessarily to you).  
**Cross-town:** Rumor edges — reigniting Elias can send a nail proof to Lowmere’s Tom via procedural cart/ferry event; Marrow’s path can intercept.

---

## 7. Self-review

- No TBDs left in option list; assumptions table owns unknowns.  
- No contradiction with wound×method matrix — only *ritual flavor* and modifiers change.  
- Scope: one protagonist pipeline for M2.  
- Ambiguity: “large” movement = blocked on `door_front` tags, allowed on `lane|breach|ford|den_path`.  
- Choice **not final** until Alex reviews.

---

## 8. Ask for Alex

Approve **Marrow**, switch to **Ivy**, switch to **Brood**, or request a hybrid (e.g. Rook + ogre den fantasy)? Until then, implementation docs assume Marrow but remain data-swappable via `protagonist.json`.

