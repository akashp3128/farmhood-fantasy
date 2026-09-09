import { PRESS_CONFIG } from './config.mjs';
import { assert, fetchJson } from './utils.mjs';

function outputText(response) {
  if (typeof response?.output_text === 'string') return response.output_text;
  for (const item of response?.output || []) {
    for (const content of item?.content || []) {
      if (content?.type === 'refusal') throw new Error('The generation-readiness check was refused.');
      if (content?.type === 'output_text' && typeof content.text === 'string') return content.text;
    }
  }
  throw new Error('The generation-readiness check returned no text.');
}

function priceForModel(model) {
  return Object.entries(PRESS_CONFIG.modelPricingPerMillionTokens)
    .find(([name]) => model === name || model.startsWith(`${name}-`))?.[1] || null;
}

async function main() {
  const apiKey = process.env.OPENAI_API_KEY;
  assert(apiKey, 'OPENAI_API_KEY is unavailable.');
  const model = process.env.OPENAI_MODEL || PRESS_CONFIG.openaiModel;
  assert(priceForModel(model), `No cost guard is configured for ${model}.`);
  const metadata = await fetchJson(`${PRESS_CONFIG.openaiApiRoot}/models/${encodeURIComponent(model)}`, {
    timeoutMs: 30_000,
    attempts: 1,
    label: 'OpenAI credential and model check',
    headers: { Authorization: `Bearer ${apiKey}` }
  });
  assert(metadata?.id, 'The credential check returned no model metadata.');

  const testGeneration = process.argv.includes('--generation');
  if (!testGeneration) {
    console.log(JSON.stringify({ status: 'ok', check: 'credential_and_model_visibility', model: metadata.id, generatedTokens: 0 }, null, 2));
    return;
  }

  const schema = {
    type: 'object',
    additionalProperties: false,
    properties: { status: { type: 'string', enum: ['ok'] } },
    required: ['status']
  };
  const response = await fetchJson(`${PRESS_CONFIG.openaiApiRoot}/responses`, {
    method: 'POST',
    timeoutMs: 90_000,
    attempts: 1,
    label: 'OpenAI generation-readiness check',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      service_tier: 'default',
      reasoning: { effort: model.startsWith('gpt-5.6-terra') || model.startsWith('gpt-5.6-luna') ? 'none' : 'low' },
      instructions: 'Return the requested structured status. Do not add commentary.',
      input: 'Confirm that this API project can generate one minimal Farmhood Press response.',
      text: { verbosity: 'low', format: { type: 'json_schema', name: 'farmhood_press_connection', strict: true, schema } },
      max_output_tokens: 128,
      prompt_cache_options: { mode: 'explicit' },
      store: false
    })
  });
  assert(response?.status === 'completed', `The generation-readiness check did not complete: ${response?.error?.message || response?.incomplete_details?.reason || response?.status || 'unknown reason'}`);
  const result = JSON.parse(outputText(response));
  assert(result.status === 'ok', 'The generation-readiness check returned an unexpected status.');
  assert(response?.usage && Number.isFinite(Number(response.usage.input_tokens)) && Number.isFinite(Number(response.usage.output_tokens)), 'The generation-readiness check returned no token usage.');
  const inputTokens = Number(response.usage.input_tokens);
  const cachedInputTokens = Number(response.usage.input_tokens_details?.cached_tokens || 0);
  const cacheWriteInputTokens = Number(response.usage.input_tokens_details?.cache_write_tokens || 0);
  const outputTokens = Number(response.usage.output_tokens);
  const price = priceForModel(response.model || model);
  const uncachedInputTokens = Math.max(0, inputTokens - cachedInputTokens - cacheWriteInputTokens);
  const estimatedCostUsd = (
    uncachedInputTokens * price.input
    + cachedInputTokens * price.cachedInput
    + cacheWriteInputTokens * price.cacheWriteInput
    + outputTokens * price.output
  ) / 1_000_000;
  console.log(JSON.stringify({
    status: 'ok',
    check: 'generation_ready',
    model: response.model || model,
    inputTokens,
    outputTokens,
    estimatedCostUsd: Number(estimatedCostUsd.toFixed(6))
  }, null, 2));
}

main().catch((error) => {
  console.error(`OpenAI connection check failed: ${error.message}`);
  process.exitCode = 1;
});
