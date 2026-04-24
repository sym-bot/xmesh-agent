'use strict';

// Model adapter contract — runtime doc §4.3.

class ModelAdapter {
  // eslint-disable-next-line no-unused-vars
  async call({ systemPrompt, messages, maxTokens, tools }) {
    throw new Error('ModelAdapter.call — subclass must implement (runtime doc §4.3)');
  }
}

module.exports = { ModelAdapter };
