import { PRESS_CONFIG } from './config.mjs';
import { assert, fetchJson } from './utils.mjs';

function outputText(response) {
  if (typeof response?.output_text === 'string') return response.output_text;
  for (const item of response?.output || []) {
    for (const content of item?.content || []) {
      if (content?.type === 'refusal') throw new Error('The connection check was refused.');
      if (content?.type === 'output_text' && typeof content.text === 'string') return content.text;
    }
  }
  throw new Error('The connection check returned no text.');
}

async function main() {
  const apiKey = process.env.OPENAI_API_KEY;
  assert(apiKey, 'OPENAI_API_KEY is unavailable.');
  const model = process.env.OPENAI_MODEL || PRESS_CONFIG.openaiModel;
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
    label: 'OpenAI connection check',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      reasoning: { effort: 'low' },
      instructions: 'Return the requested structured status. Do not add commentary.',
      input: 'Confirm that the Farmhood Press generation connection is available.',
      text: { format: { type: 'json_schema', name: 'farmhood_press_connection', strict: true, schema } },
      max_output_tokens: 128,
      store: false
    })
  });
  const result = JSON.parse(outputText(response));
  assert(result.status === 'ok', 'The connection check returned an unexpected status.');
  console.log(JSON.stringify({ status: 'ok', model: response.model || model, responseId: response.id || null }, null, 2));
}

main().catch((error) => {
  console.error(`OpenAI connection check failed: ${error.message}`);
  process.exitCode = 1;
});
