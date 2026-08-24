/**
 * Quest Items Assembler
 *
 * Thin composition of the individual item factories in this folder — each
 * item (desk, journal, key, crest, gate...) is independently defined/edited
 * in its own file; this just places them all and returns the entity handles
 * `game.ts`'s action wiring needs. See docs/architecture/levels.md.
 */

import type { EntityInstance } from '../../../../../presets/index.js';
import type { RenderoniEngine } from '../../../../../core/engine.js';
import { buildStudyDesk } from './StudyDesk.js';
import { buildJournal } from './Journal.js';
import { buildKeyPedestal } from './KeyPedestal.js';
import { buildWindingKeyPickup } from './WindingKeyPickup.js';
import { buildCrestAltar } from './CrestAltar.js';
import { buildBlackwoodCrest } from './BlackwoodCrest.js';
import { buildEscapeGate } from './EscapeGate.js';

export interface QuestItemsResult {
  journalEntity: EntityInstance;
  keyEntity: EntityInstance;
  crestEntity: EntityInstance;
  gateEntity: EntityInstance;
}

export function buildQuestItems(engine: RenderoniEngine): QuestItemsResult {
  buildStudyDesk(engine);
  const journalEntity = buildJournal(engine);

  buildKeyPedestal(engine);
  const keyEntity = buildWindingKeyPickup(engine);

  buildCrestAltar(engine);
  const crestEntity = buildBlackwoodCrest(engine);

  const gateEntity = buildEscapeGate(engine);

  return { journalEntity, keyEntity, crestEntity, gateEntity };
}
