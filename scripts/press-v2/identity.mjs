import { deepFreeze, identifier, invariant, nonEmptyText } from './utils.mjs';

const ENTITY_TYPES = Object.freeze(['league', 'manager', 'player']);

function entityKey(type, id) {
  return `${type}:${id}`;
}

function normalizeExternalIds(value, label) {
  if (value === undefined || value === null) return {};
  invariant(value && typeof value === 'object' && !Array.isArray(value), `${label} must be an object.`);
  return Object.fromEntries(Object.entries(value).map(([provider, id]) => [
    identifier(provider, `${label} provider`),
    identifier(id, `${label}.${provider}`)
  ]));
}

function normalizeEntity(type, raw) {
  invariant(raw && typeof raw === 'object', `${type} identity must be an object.`);
  const idField = `${type}Id`;
  const labelField = type === 'manager' ? 'displayName' : type === 'player' ? 'fullName' : 'name';
  const id = identifier(raw[idField] ?? raw.id, `${type}.${idField}`);
  const label = nonEmptyText(raw[labelField] ?? raw.label, `${type}.${labelField}`, 80);
  const base = {
    type,
    id,
    key: entityKey(type, id),
    label,
    externalIds: normalizeExternalIds(raw.externalIds, `${type}.${id}.externalIds`)
  };
  if (type === 'manager') {
    return deepFreeze({
      ...base,
      ownerId: raw.ownerId == null ? null : identifier(raw.ownerId, `manager.${id}.ownerId`),
      rosterId: raw.rosterId == null ? null : identifier(raw.rosterId, `manager.${id}.rosterId`),
      active: raw.active !== false
    });
  }
  if (type === 'player') {
    return deepFreeze({
      ...base,
      position: raw.position == null ? null : nonEmptyText(raw.position, `player.${id}.position`, 12).toUpperCase(),
      nflTeam: raw.nflTeam == null ? null : nonEmptyText(raw.nflTeam, `player.${id}.nflTeam`, 6).toUpperCase()
    });
  }
  return deepFreeze(base);
}

export class IdentityIndex {
  #entities = new Map();
  #external = new Map();
  #managerLabels = new Map();

  constructor({ leagues = [], managers = [], players = [] } = {}) {
    leagues.forEach((raw) => this.#register(normalizeEntity('league', raw)));
    managers.forEach((raw) => this.#register(normalizeEntity('manager', raw)));
    players.forEach((raw) => this.#register(normalizeEntity('player', raw)));
  }

  #register(entity) {
    invariant(!this.#entities.has(entity.key), `Duplicate identity ${entity.key}.`);
    if (entity.type === 'manager') {
      const normalizedLabel = entity.label.toLocaleLowerCase('en-US');
      invariant(!this.#managerLabels.has(normalizedLabel), `Manager display name ${entity.label} is not unique.`);
      this.#managerLabels.set(normalizedLabel, entity.key);
    }
    this.#entities.set(entity.key, entity);
    Object.entries(entity.externalIds).forEach(([provider, externalId]) => {
      const externalKey = `${entity.type}:${provider}:${externalId}`;
      invariant(!this.#external.has(externalKey), `External identity ${externalKey} maps to more than one entity.`);
      this.#external.set(externalKey, entity.key);
    });
  }

  resolve(type, id) {
    invariant(ENTITY_TYPES.includes(type), `Unsupported entity type ${type}.`);
    const normalizedId = identifier(id, `${type} id`);
    const entity = this.#entities.get(entityKey(type, normalizedId));
    invariant(entity, `Unknown ${type} identity ${normalizedId}.`);
    return entity;
  }

  resolveExternal(type, provider, externalId) {
    const externalKey = `${type}:${identifier(provider, 'provider')}:${identifier(externalId, 'external id')}`;
    const key = this.#external.get(externalKey);
    invariant(key, `Unknown external identity ${externalKey}.`);
    return this.#entities.get(key);
  }

  reference(type, id) {
    const entity = this.resolve(type, id);
    return deepFreeze({ type: entity.type, id: entity.id, key: entity.key, label: entity.label });
  }

  has(type, id) {
    return this.#entities.has(entityKey(type, String(id)));
  }

  list(type = null) {
    if (type !== null) invariant(ENTITY_TYPES.includes(type), `Unsupported entity type ${type}.`);
    return [...this.#entities.values()]
      .filter((entity) => type === null || entity.type === type)
      .sort((left, right) => left.key.localeCompare(right.key));
  }

  toJSON() {
    return this.list();
  }
}

export function createIdentityIndex({ league, managers, players }) {
  invariant(league && typeof league === 'object', 'league identity is required.');
  return new IdentityIndex({
    leagues: [{ leagueId: league.leagueId, name: league.name, externalIds: league.externalIds }],
    managers,
    players
  });
}
