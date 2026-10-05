export const PRESS_V2_CONTRACT_VERSION = 2;
export const PRESS_V2_BYLINE = 'Farmhood Press Sports Desk';
export const PRESS_V2_EDITIONS = Object.freeze(['recap', 'weekend_outlook']);

export const PRESS_V2_DESK_SECTIONS = Object.freeze({
  recap: Object.freeze(['turning_points', 'standings_fallout', 'receipt_desk', 'carries_forward']),
  weekend_outlook: Object.freeze(['thursday_headline', 'availability_desk', 'standings_stakes', 'sunday_watch'])
});

const stringSchema = (maxLength, minLength = 1) => ({ type: 'string', minLength, maxLength });
const uniqueStringArray = (item, minItems = 1, maxItems = 8) => ({
  type: 'array',
  minItems,
  maxItems,
  items: item
});
const uniqueIntegerArray = (item, minItems = 1, maxItems = 2) => ({
  type: 'array',
  minItems,
  maxItems,
  items: item
});

function requireContext({ edition, factIds, managerNames, matchupIds }) {
  if (!PRESS_V2_EDITIONS.includes(edition)) throw new Error(`Unknown Press V2 edition: ${edition}`);
  for (const [label, value] of Object.entries({ factIds, managerNames, matchupIds })) {
    if (!Array.isArray(value) || value.length === 0) throw new Error(`${label} must be a non-empty array.`);
  }
}

function matchupManagerSet(context, matchupIds) {
  return new Set(matchupIds.flatMap((id) => context.matchupManagers?.[String(id)] || []));
}

function inspectMatchupCitations(block, path, declaredMatchups, context, issues) {
  const allowed = new Set(declaredMatchups);
  for (const factId of block?.factIds || []) {
    const factMatchupId = context.factMatchupIds?.[factId];
    if (Number.isInteger(factMatchupId) && !allowed.has(factMatchupId)) {
      issues.push(issue('citation.matchup_mismatch', `${path}.factIds`, `${factId} belongs to Matchup ${factMatchupId}, outside this story's declared matchup IDs.`));
    }
  }
}

const CORE_MATCHUP_FACT_KINDS = new Set(['matchup_result', 'team_week_score', 'team_week_projection', 'matchup_margin', 'matchup_projection_edge', 'matchup_outlook_edge']);

function inspectStoryEvidence(blocks, path, declaredMatchups, context, issues) {
  const factIds = [...new Set((blocks || []).flatMap((block) => block?.factIds || []))];
  for (const matchupId of declaredMatchups) {
    const hasCore = factIds.some((factId) => context.factMatchupIds?.[factId] === matchupId && CORE_MATCHUP_FACT_KINDS.has(context.factKinds?.[factId]));
    if (!hasCore) issues.push(issue('citation.matchup_core_missing', `${path}.body`, `The story needs at least one core result/score/projection fact for Matchup ${matchupId}.`));
  }
  const scopedManagers = matchupManagerSet(context, declaredMatchups);
  for (const factId of factIds) {
    if ((context.factTags?.[factId] || []).includes('history')) continue;
    for (const manager of context.factManagerNames?.[factId] || []) {
      if (scopedManagers.size && !scopedManagers.has(manager)) issues.push(issue('citation.subject_mismatch', `${path}.body`, `${factId} introduces ${manager}, outside the declared matchup managers.`));
    }
  }
}

function citedParagraphSchema(maxLength = 900) {
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      text: stringSchema(maxLength, 20),
      factIds: uniqueStringArray({ $ref: '#/$defs/factId' }, 1, 8)
    },
    required: ['text', 'factIds']
  };
}

function featureSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      headline: stringSchema(120, 8),
      subjects: uniqueStringArray({ $ref: '#/$defs/manager' }, 1, 4),
      matchupIds: uniqueIntegerArray({ $ref: '#/$defs/matchupId' }, 1, 2),
      body: {
        type: 'array',
        minItems: 2,
        maxItems: 4,
        items: { $ref: '#/$defs/citedParagraph' }
      }
    },
    required: ['headline', 'subjects', 'matchupIds', 'body']
  };
}

function deskSectionSchema(edition, matchupCount) {
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      kind: { type: 'string', enum: [...PRESS_V2_DESK_SECTIONS[edition]] },
      headline: stringSchema(100, 5),
      subjects: uniqueStringArray({ $ref: '#/$defs/manager' }, 0, 6),
      matchupIds: uniqueIntegerArray({ $ref: '#/$defs/matchupId' }, 0, matchupCount),
      body: {
        type: 'array',
        minItems: 1,
        maxItems: 3,
        items: { $ref: '#/$defs/deskParagraph' }
      }
    },
    required: ['kind', 'headline', 'subjects', 'matchupIds', 'body']
  };
}

function notebookSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      matchupId: { $ref: '#/$defs/matchupId' },
      headline: stringSchema(100, 8),
      subjects: uniqueStringArray({ $ref: '#/$defs/manager' }, 2, 2),
      body: stringSchema(550, 30),
      factIds: uniqueStringArray({ $ref: '#/$defs/factId' }, 1, 6)
    },
    required: ['matchupId', 'headline', 'subjects', 'body', 'factIds']
  };
}

/**
 * Strict schema intended for a single Structured Outputs response.
 * The assignment desk supplies only the enum values available to this edition.
 */
export function longFormArticleSchema(context) {
  requireContext(context);
  const { edition, factIds, managerNames, matchupIds } = context;
  return {
    type: 'object',
    additionalProperties: false,
    $defs: {
      factId: { type: 'string', enum: [...factIds] },
      manager: { type: 'string', enum: [...managerNames] },
      matchupId: { type: 'integer', enum: [...matchupIds] },
      citedParagraph: citedParagraphSchema(900),
      thesisParagraph: citedParagraphSchema(420),
      deskParagraph: citedParagraphSchema(750),
      pullQuoteParagraph: citedParagraphSchema(180),
      feature: featureSchema(),
      deskSection: deskSectionSchema(edition, matchupIds.length),
      notebook: notebookSchema()
    },
    properties: {
      contractVersion: { type: 'integer', enum: [PRESS_V2_CONTRACT_VERSION] },
      edition: { type: 'string', enum: [edition] },
      title: stringSchema(140, 18),
      dek: stringSchema(280, 35),
      byline: { type: 'string', enum: [PRESS_V2_BYLINE] },
      thesis: { $ref: '#/$defs/thesisParagraph' },
      lead: {
        type: 'array',
        minItems: 2,
        maxItems: 3,
        items: { $ref: '#/$defs/citedParagraph' }
      },
      mainEvent: { $ref: '#/$defs/feature' },
      supportingStories: {
        type: 'array',
        minItems: 2,
        maxItems: 2,
        items: { $ref: '#/$defs/feature' }
      },
      deskSections: {
        type: 'array',
        minItems: PRESS_V2_DESK_SECTIONS[edition].length,
        maxItems: PRESS_V2_DESK_SECTIONS[edition].length,
        items: { $ref: '#/$defs/deskSection' }
      },
      aroundLeague: {
        type: 'array',
        minItems: Math.max(1, matchupIds.length - 4),
        maxItems: matchupIds.length,
        items: { $ref: '#/$defs/notebook' }
      },
      pullQuote: { $ref: '#/$defs/pullQuoteParagraph' },
      tags: {
        type: 'array',
        minItems: 2,
        maxItems: 6,
        items: stringSchema(40, 2)
      }
    },
    required: [
      'contractVersion', 'edition', 'title', 'dek', 'byline', 'thesis', 'lead',
      'mainEvent', 'supportingStories', 'deskSections', 'aroundLeague', 'pullQuote', 'tags'
    ]
  };
}

function issue(code, path, message) {
  return { code, path, message };
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function inspectCitedBlock(block, path, allowedFactIds, issues) {
  if (!block || typeof block !== 'object' || Array.isArray(block)) {
    issues.push(issue('shape.block', path, 'Expected a cited paragraph object.'));
    return;
  }
  if (!isNonEmptyString(block.text)) issues.push(issue('shape.text', `${path}.text`, 'Paragraph text is required.'));
  if (!Array.isArray(block.factIds) || block.factIds.length === 0) {
    issues.push(issue('citation.missing', `${path}.factIds`, 'Every narrative paragraph requires at least one fact ID.'));
    return;
  }
  if (new Set(block.factIds).size !== block.factIds.length) {
    issues.push(issue('citation.duplicate', `${path}.factIds`, 'A paragraph must not repeat the same fact ID.'));
  }
  for (const factId of block.factIds) {
    if (!allowedFactIds.has(factId)) issues.push(issue('citation.unknown', `${path}.factIds`, `Unknown fact ID: ${factId}`));
  }
}

function inspectFeature(feature, path, context, issues) {
  const { allowedManagers, allowedMatchups, allowedFactIds } = context;
  if (!feature || typeof feature !== 'object' || Array.isArray(feature)) {
    issues.push(issue('shape.feature', path, 'Expected a feature object.'));
    return;
  }
  if (!isNonEmptyString(feature.headline)) issues.push(issue('shape.headline', `${path}.headline`, 'Feature headline is required.'));
  if (!Array.isArray(feature.subjects) || feature.subjects.length === 0) {
    issues.push(issue('shape.subjects', `${path}.subjects`, 'A feature needs at least one canonical manager subject.'));
  } else {
    if (new Set(feature.subjects).size !== feature.subjects.length) issues.push(issue('manager.duplicate', `${path}.subjects`, 'Feature subjects must be unique.'));
    feature.subjects.forEach((name) => {
      if (!allowedManagers.has(name)) issues.push(issue('manager.unknown', `${path}.subjects`, `Unknown manager: ${name}`));
    });
  }
  if (!Array.isArray(feature.matchupIds) || feature.matchupIds.length === 0) {
    issues.push(issue('shape.matchups', `${path}.matchupIds`, 'A feature needs at least one matchup ID.'));
  } else {
    if (new Set(feature.matchupIds).size !== feature.matchupIds.length) issues.push(issue('matchup.duplicate', `${path}.matchupIds`, 'Feature matchup IDs must be unique.'));
    feature.matchupIds.forEach((id) => {
      if (!allowedMatchups.has(id)) issues.push(issue('matchup.unknown', `${path}.matchupIds`, `Unknown matchup ID: ${id}`));
    });
  }
  if (Array.isArray(feature.subjects) && Array.isArray(feature.matchupIds) && feature.matchupIds.length) {
    const scopedManagers = matchupManagerSet(context, feature.matchupIds);
    feature.subjects.forEach((name) => {
      if (context.allowedManagers.has(name) && !scopedManagers.has(name)) issues.push(issue('manager.matchup_mismatch', `${path}.subjects`, `${name} does not belong to the feature's matchup IDs.`));
    });
  }
  if (Array.isArray(feature.body) && Array.isArray(feature.matchupIds) && feature.matchupIds.length) inspectStoryEvidence(feature.body, path, feature.matchupIds, context, issues);
  if (!Array.isArray(feature.body) || feature.body.length < 2) {
    issues.push(issue('shape.feature_body', `${path}.body`, 'A feature needs at least two cited paragraphs.'));
  } else {
    feature.body.forEach((block, index) => {
      inspectCitedBlock(block, `${path}.body[${index}]`, allowedFactIds, issues);
      inspectMatchupCitations(block, `${path}.body[${index}]`, feature.matchupIds || [], context, issues);
    });
  }
}

function inspectDeskSection(section, path, context, edition, issues) {
  if (!section || typeof section !== 'object' || Array.isArray(section)) {
    issues.push(issue('shape.desk_section', path, 'Expected a desk-section object.'));
    return;
  }
  if (!PRESS_V2_DESK_SECTIONS[edition].includes(section.kind)) {
    issues.push(issue('section.unknown', `${path}.kind`, `Unknown ${edition} section: ${section.kind}`));
  }
  if (!isNonEmptyString(section.headline)) issues.push(issue('shape.headline', `${path}.headline`, 'Desk-section headline is required.'));
  for (const name of section.subjects || []) {
    if (!context.allowedManagers.has(name)) issues.push(issue('manager.unknown', `${path}.subjects`, `Unknown manager: ${name}`));
  }
  for (const id of section.matchupIds || []) {
    if (!context.allowedMatchups.has(id)) issues.push(issue('matchup.unknown', `${path}.matchupIds`, `Unknown matchup ID: ${id}`));
  }
  if ((section.matchupIds || []).length) {
    const scopedManagers = matchupManagerSet(context, section.matchupIds);
    for (const name of section.subjects || []) {
      if (context.allowedManagers.has(name) && !scopedManagers.has(name)) issues.push(issue('manager.matchup_mismatch', `${path}.subjects`, `${name} does not belong to the desk section's matchup IDs.`));
    }
  }
  if (!Array.isArray(section.body) || section.body.length === 0) {
    issues.push(issue('shape.desk_body', `${path}.body`, 'A desk section needs cited copy.'));
  } else {
    section.body.forEach((block, index) => {
      inspectCitedBlock(block, `${path}.body[${index}]`, context.allowedFactIds, issues);
      if ((section.matchupIds || []).length) inspectMatchupCitations(block, `${path}.body[${index}]`, section.matchupIds, context, issues);
    });
  }
}

/**
 * Runtime structural checks complement the JSON schema and enforce cross-field rules.
 * Returns issues instead of throwing so a copy desk can show all repair work at once.
 */
export function validateLongFormShape(article, inputContext) {
  requireContext(inputContext);
  const { edition, factIds, managerNames, matchupIds } = inputContext;
  const issues = [];
  const context = {
    allowedFactIds: new Set(factIds),
    allowedManagers: new Set(managerNames),
    allowedMatchups: new Set(matchupIds),
    matchupManagers: inputContext.matchupManagers || {},
    factMatchupIds: inputContext.factMatchupIds || {},
    factKinds: inputContext.factKinds || {},
    factTags: inputContext.factTags || {},
    factManagerNames: inputContext.factManagerNames || {}
  };
  if (!article || typeof article !== 'object' || Array.isArray(article)) {
    return [issue('shape.article', '$', 'Expected a Press V2 article object.')];
  }
  if (article.contractVersion !== PRESS_V2_CONTRACT_VERSION) {
    issues.push(issue('shape.version', '$.contractVersion', `Expected contract version ${PRESS_V2_CONTRACT_VERSION}.`));
  }
  if (article.edition !== edition) issues.push(issue('shape.edition', '$.edition', `Expected edition ${edition}.`));
  if (article.byline !== PRESS_V2_BYLINE) issues.push(issue('shape.byline', '$.byline', `Byline must be ${PRESS_V2_BYLINE}.`));
  if (!isNonEmptyString(article.title)) issues.push(issue('shape.title', '$.title', 'Article title is required.'));
  if (!isNonEmptyString(article.dek)) issues.push(issue('shape.dek', '$.dek', 'Article dek is required.'));

  inspectCitedBlock(article.thesis, '$.thesis', context.allowedFactIds, issues);
  if (!Array.isArray(article.lead) || article.lead.length < 2 || article.lead.length > 3) {
    issues.push(issue('shape.lead', '$.lead', 'Lead must contain two or three cited paragraphs.'));
  } else {
    article.lead.forEach((block, index) => inspectCitedBlock(block, `$.lead[${index}]`, context.allowedFactIds, issues));
  }

  inspectFeature(article.mainEvent, '$.mainEvent', context, issues);
  if (!Array.isArray(article.supportingStories) || article.supportingStories.length !== 2) {
    issues.push(issue('shape.supporting', '$.supportingStories', 'Exactly two supporting stories are required.'));
  } else {
    article.supportingStories.forEach((feature, index) => inspectFeature(feature, `$.supportingStories[${index}]`, context, issues));
  }

  if (!Array.isArray(article.deskSections)) {
    issues.push(issue('shape.desk_sections', '$.deskSections', 'Edition desk sections are required.'));
  } else {
    article.deskSections.forEach((section, index) => inspectDeskSection(section, `$.deskSections[${index}]`, context, edition, issues));
    const actualKinds = article.deskSections.map((section) => section?.kind).filter(Boolean);
    for (const expectedKind of PRESS_V2_DESK_SECTIONS[edition]) {
      const count = actualKinds.filter((kind) => kind === expectedKind).length;
      if (count !== 1) issues.push(issue('section.required', '$.deskSections', `Expected exactly one ${expectedKind} section; found ${count}.`));
    }
  }

  const hierarchyMatchups = [];
  if (Array.isArray(article.mainEvent?.matchupIds)) hierarchyMatchups.push(...article.mainEvent.matchupIds);
  for (const feature of article.supportingStories || []) {
    if (Array.isArray(feature?.matchupIds)) hierarchyMatchups.push(...feature.matchupIds);
  }
  if (!Array.isArray(article.aroundLeague) || article.aroundLeague.length === 0) {
    issues.push(issue('shape.notebook', '$.aroundLeague', 'Around the League needs at least one matchup note.'));
  } else {
    article.aroundLeague.forEach((entry, index) => {
      const path = `$.aroundLeague[${index}]`;
      if (!context.allowedMatchups.has(entry?.matchupId)) issues.push(issue('matchup.unknown', `${path}.matchupId`, `Unknown matchup ID: ${entry?.matchupId}`));
      else hierarchyMatchups.push(entry.matchupId);
      if (!isNonEmptyString(entry?.headline) || !isNonEmptyString(entry?.body)) issues.push(issue('shape.notebook_entry', path, 'Notebook entry needs a headline and body.'));
      for (const name of entry?.subjects || []) {
        if (!context.allowedManagers.has(name)) issues.push(issue('manager.unknown', `${path}.subjects`, `Unknown manager: ${name}`));
      }
      const expectedSubjects = new Set(context.matchupManagers[String(entry?.matchupId)] || []);
      const actualSubjects = new Set(entry?.subjects || []);
      if (expectedSubjects.size && (actualSubjects.size !== expectedSubjects.size || [...expectedSubjects].some((name) => !actualSubjects.has(name)))) {
        issues.push(issue('manager.matchup_mismatch', `${path}.subjects`, `Around the League subjects must be the two managers in Matchup ${entry?.matchupId}.`));
      }
      inspectCitedBlock({ text: entry?.body, factIds: entry?.factIds }, path, context.allowedFactIds, issues);
      inspectMatchupCitations({ factIds: entry?.factIds }, path, [entry?.matchupId], context, issues);
      inspectStoryEvidence([{ factIds: entry?.factIds }], path, [entry?.matchupId], context, issues);
    });
  }
  for (const matchupId of matchupIds) {
    const count = hierarchyMatchups.filter((id) => id === matchupId).length;
    if (count !== 1) issues.push(issue('matchup.coverage', '$', `Matchup ${matchupId} must appear exactly once in the story hierarchy; found ${count}.`));
  }
  inspectCitedBlock(article.pullQuote, '$.pullQuote', context.allowedFactIds, issues);
  if (!Array.isArray(article.tags) || article.tags.length < 2) issues.push(issue('shape.tags', '$.tags', 'At least two article tags are required.'));
  else if (new Set(article.tags).size !== article.tags.length) issues.push(issue('shape.tags', '$.tags', 'Article tags must be unique.'));
  return issues;
}
