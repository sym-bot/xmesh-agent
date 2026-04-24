#!/usr/bin/env node
'use strict';

const { version } = require('../../package.json');
const { sendRequest } = require('./ipc.js');

function printHelp() {
  process.stdout.write(
    [
      'xmesh-agent — autonomous agent runtime for the xmesh mesh',
      '',
      'Usage:',
      '  xmesh-agent <command> [options]',
      '',
      'Commands:',
      '  run --config <path>   Start a peer (headless attach) from agent.toml',
      '  stop <peer-name>      Graceful shutdown of a running peer',
      '  status <peer-name>    Report peer state, uptime, budget usage',
      '  cost <peer-name>      Report token + cost counters',
      '  trace <peer-name> <cmb-id>   Print ancestor lineage for a CMB',
      '',
      '  --help, -h            This message',
      '  --version, -v         Print version',
      '',
      `Version: ${version}`,
      'Docs: sym-strategy/architecture/xmesh_runtime_v0.1.md',
      '',
    ].join('\n'),
  );
}

function parseFlag(args, name) {
  const i = args.indexOf(name);
  if (i === -1) return null;
  return args[i + 1] || null;
}

async function dispatchRun(args) {
  const configPath = parseFlag(args, '--config');
  if (!configPath) {
    process.stderr.write('xmesh-agent run: missing --config <path>\n');
    return 2;
  }
  try {
    const { runFromConfig } = require('./run.js');
    await runFromConfig(configPath);
    await new Promise(() => {});
    return 0;
  } catch (err) {
    process.stderr.write(`xmesh-agent run: ${err.message}\n`);
    return 1;
  }
}

async function dispatchIpc(cmd, args) {
  const peerName = args[0];
  if (!peerName) {
    process.stderr.write(`xmesh-agent ${cmd}: missing peer-name argument\n`);
    return 2;
  }
  try {
    const extra = {};
    if (cmd === 'trace') {
      const cmbId = args[1];
      if (!cmbId) {
        process.stderr.write('xmesh-agent trace: missing cmb-id argument\n');
        return 2;
      }
      extra.cmbId = cmbId;
    }
    const res = await sendRequest(peerName, cmd, extra);
    if (!res.ok) {
      process.stderr.write(`xmesh-agent ${cmd}: ${res.error}\n`);
      return 1;
    }
    process.stdout.write(formatResult(cmd, res) + '\n');
    return 0;
  } catch (err) {
    process.stderr.write(`xmesh-agent ${cmd}: ${err.message}\n`);
    return 1;
  }
}

function formatResult(cmd, res) {
  const { ok, ...body } = res;
  if (cmd === 'status') {
    return [
      `peer:       ${body.peer}`,
      `group:      ${body.group}`,
      `model:      ${body.model}`,
      `uptime_ms:  ${body.uptimeMs}`,
      `running:    ${body.stats.running}`,
      `emitted:    ${body.stats.cmbsEmitted}`,
      `suppressed: ${body.stats.cmbsSuppressed}`,
      `cost_usd:   ${body.stats.costUsdTotal.toFixed(6)}`,
      `budget:     minute=${body.budget.currentCounts.minute}/${body.budget.maxWakesPerMinute} hour=${body.budget.currentCounts.hour}/${body.budget.maxWakesPerHour} day=${body.budget.currentCounts.day}/${body.budget.maxWakesPerDay}`,
    ].join('\n');
  }
  if (cmd === 'cost') {
    return [
      `peer:       ${body.peer}`,
      `cost_usd:   ${body.costUsdTotal.toFixed(6)}`,
      `emitted:    ${body.cmbsEmitted}`,
      `suppressed: ${body.cmbsSuppressed}`,
      `caps:       per_hour=$${body.caps.perHour} per_day=$${body.caps.perDay} per_run=$${body.caps.perRun}`,
    ].join('\n');
  }
  if (cmd === 'trace') {
    const lines = [`root: ${body.root}`];
    for (const link of body.chain) {
      const prefix = '  '.repeat(link.depth);
      if (link.missing) { lines.push(`${prefix}[${link.id}] (not found)`); continue; }
      const fields = Object.entries(link.fields || {})
        .map(([k, v]) => `${k}="${typeof v === 'string' ? v : v?.text || ''}"`)
        .join(' ');
      lines.push(`${prefix}[${link.id}] by ${link.source} | ${fields}`);
    }
    return lines.join('\n');
  }
  if (cmd === 'stop') return `stop accepted: ${body.accepted}`;
  return JSON.stringify(body, null, 2);
}

async function main(argv) {
  const args = argv.slice(2);
  if (args.length === 0 || args.includes('-h') || args.includes('--help')) {
    printHelp();
    return 0;
  }
  if (args.includes('-v') || args.includes('--version')) {
    process.stdout.write(`${version}\n`);
    return 0;
  }
  const cmd = args[0];
  switch (cmd) {
    case 'run':
      return dispatchRun(args.slice(1));
    case 'stop':
    case 'status':
    case 'cost':
    case 'trace':
      return dispatchIpc(cmd, args.slice(1));
    default:
      process.stderr.write(`xmesh-agent: unknown command "${cmd}". Try --help.\n`);
      return 2;
  }
}

if (require.main === module) {
  main(process.argv).then((code) => process.exit(code)).catch((err) => {
    process.stderr.write(`xmesh-agent: fatal ${err.message}\n`);
    process.exit(1);
  });
}

module.exports = { main, formatResult };
