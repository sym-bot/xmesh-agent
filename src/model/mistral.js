'use strict';

const { ModelAdapter } = require('./adapter.js');

const MISTRAL_BASE_URL = 'https://api.mistral.ai/v1';

const MODEL_PRICING_USD_PER_MTOKEN = Object.freeze({
  'mistral-large-latest':   { input: 2.0, output: 6.0 },
  'mistral-medium-latest':  { input: 0.4, output: 2.0 },
  'mistral-small-latest':   { input: 0.1, output: 0.3 },
  'codestral-latest':       { input: 0.3, output: 0.9 },
  'open-mistral-nemo':      { input: 0.15, output: 0.15 },
  'pixtral-large-latest':   { input: 2.0, output: 6.0 },
});

function priceFor(model) {
  if (MODEL_PRICING_USD_PER_MTOKEN[model]) return MODEL_PRICING_USD_PER_MTOKEN[model];
  const prefixes = Object.keys(MODEL_PRICING_USD_PER_MTOKEN).sort((a, b) => b.length - a.length);
  for (const prefix of prefixes) {
    if (model.startsWith(prefix.replace(/-latest$/, ''))) return MODEL_PRICING_USD_PER_MTOKEN[prefix];
  }
  return { input: 2.0, output: 6.0 };
}

function estimateCostUsd(model, usage) {
  const p = priceFor(model);
  return (usage.inputTokens / 1_000_000) * p.input + (usage.outputTokens / 1_000_000) * p.output;
}

function defaultClientFactory({ apiKey, baseUrl }) {
  const OpenAI = require('openai');
  return new OpenAI.default({ apiKey, baseURL: baseUrl });
}

function toMistralTool(xmeshTool) {
  return {
    type: 'function',
    function: {
      name: xmeshTool.name,
      description: xmeshTool.description,
      parameters: xmeshTool.input_schema,
    },
  };
}

class MistralAdapter extends ModelAdapter {
  constructor({ apiKey, baseUrl, model = 'mistral-small-latest', _clientFactory } = {}) {
    super();
    this.apiKey = apiKey || process.env.MISTRAL_API_KEY;
    if (!this.apiKey) throw new Error('MistralAdapter requires apiKey or MISTRAL_API_KEY');
    this.baseUrl = baseUrl || MISTRAL_BASE_URL;
    this.model = model;
    this._clientFactory = _clientFactory || defaultClientFactory;
    this._client = null;
  }

  _ensureClient() {
    if (!this._client) this._client = this._clientFactory({ apiKey: this.apiKey, baseUrl: this.baseUrl });
    return this._client;
  }

  async call({ systemPrompt, messages, maxTokens = 1024, tools }) {
    if (!Array.isArray(messages) || messages.length === 0) {
      throw new Error('MistralAdapter.call: messages must be a non-empty array');
    }
    const client = this._ensureClient();
    const chatMessages = [];
    if (systemPrompt) chatMessages.push({ role: 'system', content: systemPrompt });
    for (const m of messages) chatMessages.push({ role: m.role, content: m.content });

    const params = {
      model: this.model,
      messages: chatMessages,
      max_tokens: maxTokens,
    };
    if (Array.isArray(tools) && tools.length > 0) {
      params.tools = tools.map(toMistralTool);
      params.tool_choice = 'auto';
    }

    const response = await client.chat.completions.create(params);
    return this._normalize(response);
  }

  _normalize(response) {
    const choice = response.choices?.[0];
    const message = choice?.message || {};
    const text = message.content || '';
    const toolCalls = [];
    for (const tc of message.tool_calls || []) {
      let parsed = {};
      const argsRaw = tc.function?.arguments;
      if (typeof argsRaw === 'string') {
        try { parsed = JSON.parse(argsRaw); }
        catch { parsed = {}; }
      } else if (argsRaw && typeof argsRaw === 'object') {
        parsed = argsRaw;
      }
      toolCalls.push({ id: tc.id, name: tc.function?.name, input: parsed });
    }
    const usage = {
      inputTokens: response.usage?.prompt_tokens ?? 0,
      outputTokens: response.usage?.completion_tokens ?? 0,
    };
    usage.costUsd = estimateCostUsd(this.model, usage);
    return {
      text,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      usage,
      stopReason: choice?.finish_reason || null,
      raw: response,
    };
  }
}

module.exports = { MistralAdapter, estimateCostUsd, priceFor, MODEL_PRICING_USD_PER_MTOKEN, MISTRAL_BASE_URL, toMistralTool };
