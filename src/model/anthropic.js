'use strict';

const { ModelAdapter } = require('./adapter.js');

// Anthropic adapter — Phase 1 MVP per runtime doc §6.1. Pending implementation.

class AnthropicAdapter extends ModelAdapter {
  constructor({ apiKey, model = 'claude-opus-4-7' }) {
    super();
    this.apiKey = apiKey;
    this.model = model;
  }

  async call(/* { systemPrompt, messages, maxTokens, tools } */) {
    throw new Error('AnthropicAdapter.call — not implemented (runtime doc §4.3 + §6.1)');
  }
}

module.exports = { AnthropicAdapter };
