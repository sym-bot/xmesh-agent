'use strict';

const { ModelAdapter } = require('./adapter.js');

const DEFAULT_BASE_URL = 'http://localhost:11434';

async function defaultFetchImpl(url, opts) {
  return fetch(url, opts);
}

class OllamaAdapter extends ModelAdapter {
  constructor({ baseUrl, model = 'llama3.2:3b', _fetchImpl } = {}) {
    super();
    const resolved = baseUrl || process.env.OLLAMA_HOST || DEFAULT_BASE_URL;
    this.baseUrl = resolved.replace(/\/$/, '');
    this.model = model;
    this._fetch = _fetchImpl || defaultFetchImpl;
  }

  async call({ systemPrompt, messages, maxTokens = 1024, tools }) {
    if (!Array.isArray(messages) || messages.length === 0) {
      throw new Error('OllamaAdapter.call: messages must be a non-empty array');
    }
    const ollamaMessages = [];
    if (systemPrompt) ollamaMessages.push({ role: 'system', content: systemPrompt });
    for (const m of messages) ollamaMessages.push({ role: m.role, content: m.content });

    const body = {
      model: this.model,
      messages: ollamaMessages,
      stream: false,
      options: { num_predict: maxTokens },
    };
    if (Array.isArray(tools) && tools.length > 0) {
      body.tools = tools.map((t) => ({
        type: 'function',
        function: { name: t.name, description: t.description, parameters: t.input_schema },
      }));
    }

    const response = await this._fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const txt = await _safeText(response);
      throw new Error(`Ollama ${response.status}: ${txt.slice(0, 200)}`);
    }
    const data = await response.json();
    return this._normalize(data);
  }

  _normalize(data) {
    const text = data?.message?.content || '';
    const toolCalls = [];
    for (const tc of data?.message?.tool_calls || []) {
      toolCalls.push({
        id: tc.id || `ollama-${toolCalls.length}`,
        name: tc.function?.name,
        input: tc.function?.arguments || {},
      });
    }
    const usage = {
      inputTokens: data?.prompt_eval_count ?? 0,
      outputTokens: data?.eval_count ?? 0,
      costUsd: 0,
    };
    return {
      text,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      usage,
      stopReason: data?.done_reason || (data?.done ? 'stop' : null),
      raw: data,
    };
  }
}

async function _safeText(response) {
  try { return await response.text(); }
  catch { return '(unreadable response body)'; }
}

module.exports = { OllamaAdapter };
