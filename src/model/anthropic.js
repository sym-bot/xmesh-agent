'use strict';

const { ModelAdapter } = require('./adapter.js');

const MODEL_PRICING_USD_PER_MTOKEN = Object.freeze({
  'claude-opus-4-7': { input: 15.0, output: 75.0 },
  'claude-opus-4-6': { input: 15.0, output: 75.0 },
  'claude-sonnet-4-6': { input: 3.0, output: 15.0 },
  'claude-haiku-4-5-20251001': { input: 0.80, output: 4.0 },
});

function priceFor(model) {
  if (MODEL_PRICING_USD_PER_MTOKEN[model]) return MODEL_PRICING_USD_PER_MTOKEN[model];
  for (const [prefix, price] of Object.entries(MODEL_PRICING_USD_PER_MTOKEN)) {
    if (model.startsWith(prefix.split('-').slice(0, 3).join('-'))) return price;
  }
  return { input: 15.0, output: 75.0 };
}

function estimateCostUsd(model, usage) {
  const p = priceFor(model);
  const inUsd = (usage.inputTokens / 1_000_000) * p.input;
  const outUsd = (usage.outputTokens / 1_000_000) * p.output;
  return inUsd + outUsd;
}

function defaultClientFactory({ apiKey }) {
  const { Anthropic } = require('@anthropic-ai/sdk');
  return new Anthropic({ apiKey });
}

class AnthropicAdapter extends ModelAdapter {
  constructor({ apiKey, model = 'claude-opus-4-7', _clientFactory } = {}) {
    super();
    this.apiKey = apiKey || process.env.ANTHROPIC_API_KEY;
    if (!this.apiKey) throw new Error('AnthropicAdapter requires apiKey or ANTHROPIC_API_KEY');
    this.model = model;
    this._clientFactory = _clientFactory || defaultClientFactory;
    this._client = null;
  }

  _ensureClient() {
    if (!this._client) {
      this._client = this._clientFactory({ apiKey: this.apiKey });
    }
    return this._client;
  }

  async call({ systemPrompt, messages, maxTokens = 1024, tools }) {
    if (!Array.isArray(messages) || messages.length === 0) {
      throw new Error('AnthropicAdapter.call: messages must be a non-empty array');
    }
    const client = this._ensureClient();
    const params = {
      model: this.model,
      max_tokens: maxTokens,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    };
    if (systemPrompt) params.system = systemPrompt;
    if (Array.isArray(tools) && tools.length > 0) params.tools = tools;

    const response = await client.messages.create(params);
    return this._normalize(response);
  }

  _normalize(response) {
    const content = Array.isArray(response.content) ? response.content : [];
    let text = '';
    const toolCalls = [];
    for (const block of content) {
      if (block.type === 'text') text += block.text;
      else if (block.type === 'tool_use') {
        toolCalls.push({ id: block.id, name: block.name, input: block.input });
      }
    }
    const usage = {
      inputTokens: response.usage?.input_tokens ?? 0,
      outputTokens: response.usage?.output_tokens ?? 0,
    };
    usage.costUsd = estimateCostUsd(this.model, usage);
    return {
      text,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      usage,
      stopReason: response.stop_reason || null,
      raw: response,
    };
  }
}

module.exports = { AnthropicAdapter, estimateCostUsd, priceFor, MODEL_PRICING_USD_PER_MTOKEN };
