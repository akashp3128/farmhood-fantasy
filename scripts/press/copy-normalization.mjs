// Only exact canonical identities may be repaired. Facts, IDs and structured
// subjects/recipients are deliberately not part of the narrative field list.
export function normalizeArticleCopy(copy, managerNames) {
  const normalized = structuredClone(copy);
  const corrections = [];
  const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const identities = [...new Set(managerNames)].map((canonical) => ({
    canonical,
    pattern: new RegExp(`(?<![A-Za-z0-9_])${[...canonical].map(escape).join('\\s*')}(?![A-Za-z0-9_])`, 'gi')
  }));
  function field(object, key, location) {
    if (typeof object?.[key] !== 'string') return;
    for (const { canonical, pattern } of identities) {
      object[key] = object[key].replace(pattern, (original) => {
        if (original !== canonical) corrections.push({ field: location, original, canonical });
        return canonical;
      });
    }
  }
  ['title', 'dek', 'pullQuote'].forEach((key) => field(normalized, key, key));
  (normalized.lead || []).forEach((_, index) => field(normalized.lead, index, `lead[${index}]`));
  ['label', 'value', 'note'].forEach((key) => field(normalized.keyStat, key, `keyStat.${key}`));
  for (const [collection, keys] of [
    ['matchups', ['headline', 'analysis', 'upsetPath', 'historyNote']],
    ['storylines', ['title', 'body']],
    ['awards', ['title', 'body']]
  ]) {
    (normalized[collection] || []).forEach((item, index) => keys.forEach((key) => field(item, key, `${collection}[${index}].${key}`)));
  }
  return { copy: normalized, corrections };
}
