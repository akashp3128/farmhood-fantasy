import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { generateWaiverRecap } from './generate-waivers.mjs';
import { buildWaiverArticle, buildWaiverSnapshot } from './waivers.mjs';

test('an existing weekly waiver edition skips before any external request', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'farmhood-waivers-'));
  try {
    const snapshotPath = path.join(root, 'content', 'transactions', '2026', 'week-03.json');
    const articlePath = path.join(root, 'content', 'articles', '2026', 'week-03-waiver-recap.json');
    const indexPath = path.join(root, 'content', 'articles', 'index.json');
    await mkdir(path.dirname(snapshotPath), { recursive: true });
    await mkdir(path.dirname(articlePath), { recursive: true });
    const snapshot = buildWaiverSnapshot({ season: 2026, week: 3, generatedAt: '2026-09-24T14:00:00.000Z', players: {}, rawTransactions: [] });
    const article = buildWaiverArticle(snapshot);
    await writeFile(snapshotPath, JSON.stringify(snapshot));
    await writeFile(articlePath, JSON.stringify(article));
    await writeFile(indexPath, JSON.stringify({ schemaVersion: 1, featuredArticleId: article.articleId, articles: [{ articleId: article.articleId, type: article.type, edition: article.edition }] }));
    let requests = 0;
    const result = await generateWaiverRecap({
      season: 2026,
      week: 3,
      now: '2026-09-30T14:00:00.000Z',
      root,
      fetchJsonImpl: async () => { requests += 1; throw new Error('must not fetch'); }
    });
    assert.equal(requests, 0);
    assert.equal(result.changed, false);
    assert.match(result.message, /already frozen/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('a partial weekly publication fails closed instead of replacing it', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'farmhood-waivers-partial-'));
  try {
    const snapshotPath = path.join(root, 'content', 'transactions', '2026', 'week-03.json');
    await mkdir(path.dirname(snapshotPath), { recursive: true });
    await writeFile(snapshotPath, JSON.stringify({ id: 'frozen-week-3', kind: 'transactions' }));
    await assert.rejects(generateWaiverRecap({ season: 2026, week: 3, now: '2026-09-30T14:00:00.000Z', root }), /partially published/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('a zero-move week publishes without downloading the player map', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'farmhood-waivers-empty-'));
  try {
    const requests = [];
    const result = await generateWaiverRecap({
      season: 2026,
      week: 4,
      now: '2026-09-30T14:00:00.000Z',
      root,
      fetchJsonImpl: async (url) => { requests.push(url); return []; }
    });
    assert.equal(result.changed, true);
    assert.equal(result.article.title, 'Week 4 Waiver Wire: No Completed Moves');
    assert.equal(requests.length, 1);
    assert.match(requests[0], /transactions\/4$/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
