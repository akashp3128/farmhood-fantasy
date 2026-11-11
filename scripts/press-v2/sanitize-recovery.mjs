import path from 'node:path';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { invariant } from './utils.mjs';

function parseCli(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 2) values[String(argv[index] || '').replace(/^--/, '')] = argv[index + 1];
  return values;
}

export function sanitizeRecovery(record) {
  invariant(record?.kind === 'farmhood_press_v2_recovery', 'Unexpected recovery record.');
  const outputText = (payload) => {
    if (typeof payload?.output_text === 'string') return payload.output_text;
    return (payload?.output || []).flatMap((item) => item?.content || []).filter((item) => item?.type === 'output_text').map((item) => item.text).join('\n') || null;
  };
  return {
    schemaVersion: record.schemaVersion,
    kind: 'farmhood_press_v2_sanitized_recovery',
    shadowOnly: true,
    articleId: record.articleId,
    generatedAt: record.generatedAt,
    validationStatus: record.validationStatus,
    paidStages: record.paidStages || [],
    estimatedCostUsd: record.estimatedCostUsd ?? null,
    usageReceiptStatus: record.usageReceiptStatus || null,
    pricingReceiptError: record.pricingReceiptError || null,
    responseIds: record.responseIds || {},
    researchUsage: record.researchUsage || null,
    writerUsage: record.writerUsage || null,
    preflights: record.preflights || {},
    acceptedResearch: record.acceptedResearch || null,
    article: record.article || null,
    recoverableStructuredOutputs: {
      research: outputText(record.rawResponses?.research),
      writer: outputText(record.rawResponses?.writer)
    },
    validationError: record.validationError || null
  };
}

export async function sanitizeRecoveryDirectory(inputDir, outputDir) {
  await mkdir(outputDir, { recursive: true });
  let entries = [];
  try { entries = await readdir(inputDir, { withFileTypes: true }); }
  catch (error) { if (error?.code === 'ENOENT') return []; throw error; }
  const written = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
    const raw = JSON.parse(await readFile(path.join(inputDir, entry.name), 'utf8'));
    const target = path.join(outputDir, entry.name);
    await writeFile(target, `${JSON.stringify(sanitizeRecovery(raw), null, 2)}\n`, 'utf8');
    written.push(target);
  }
  return written;
}

async function main() {
  const args = parseCli(process.argv.slice(2));
  invariant(args.input && args.output, '--input and --output are required.');
  const written = await sanitizeRecoveryDirectory(path.resolve(args.input), path.resolve(args.output));
  process.stdout.write(`Sanitized ${written.length} Press V2 recovery file(s).\n`);
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
}
