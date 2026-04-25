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
      '  init <peer> [--role <r>]  Scaffold a starter agent.toml for <peer>',
      '  run --config <path>       Start a peer (headless attach) from agent.toml',
      '  dry-run --config <path>   Validate config + adapters without joining mesh',
      '  schema                    Print the JSON Schema for agent.toml',
      '  migrate [--apply]         Migrate ~/.xmesh-agent → ~/.xmesh (dry-run by default)',
      '  keygen <peer> [--force]   Generate ed25519 identity keypair (identity signing v0.1)',
      '  fingerprint <peer>        Print fingerprint of peer\'s public key',
      '  trust add --group <g> --peer <p> --public-key <b64url>',
      '  trust list --group <g>',
      '  stop <peer-name>          Graceful shutdown of a running peer',
      '  status <peer-name>        Report peer state, uptime, budget usage',
      '  cost <peer-name>          Report token + cost counters',
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

async function dispatchDryRun(args) {
  const configPath = parseFlag(args, '--config');
  if (!configPath) {
    process.stderr.write('xmesh-agent dry-run: missing --config <path>\n');
    return 2;
  }
  try {
    const { dryRun } = require('./dry-run.js');
    const result = await dryRun(configPath);
    return result.ok ? 0 : 1;
  } catch (err) {
    process.stderr.write(`xmesh-agent dry-run: ${err.message}\n`);
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
  const { ok: _ok, ...body } = res;
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
    const lines = [
      `peer:       ${body.peer}`,
      `cost_usd:   ${body.costUsdTotal.toFixed(6)}  (this run)`,
      `emitted:    ${body.cmbsEmitted}`,
      `suppressed: ${body.cmbsSuppressed}`,
      `caps:       per_hour=$${body.caps.perHour} per_day=$${body.caps.perDay} per_run=$${body.caps.perRun}`,
    ];
    if (body.lifetime) {
      lines.push(
        `lifetime:   cost=$${body.lifetime.costUsdTotal.toFixed(6)} emitted=${body.lifetime.cmbsEmitted} suppressed=${body.lifetime.cmbsSuppressed} runs=${body.lifetime.runs}`,
      );
    }
    return lines.join('\n');
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
    case 'init': {
      const { init } = require('./init.js');
      return init(args.slice(1));
    }
    case 'run':
      return dispatchRun(args.slice(1));
    case 'dry-run':
      return dispatchDryRun(args.slice(1));
    case 'schema': {
      const { printSchema } = require('./schema.js');
      printSchema();
      return 0;
    }
    case 'migrate': {
      const { migrate } = require('./migrate.js');
      return migrate({ apply: args.includes('--apply') });
    }
    case 'keygen': {
      const { keygen } = require('./keys.js');
      const rest = args.slice(1);
      const peer = rest.find((a) => !a.startsWith('--'));
      if (!peer) { process.stderr.write('xmesh-agent keygen: missing <peer> argument\n'); return 2; }
      return keygen(peer, { force: rest.includes('--force') });
    }
    case 'fingerprint': {
      const { fingerprint } = require('./keys.js');
      const peer = args[1];
      if (!peer) { process.stderr.write('xmesh-agent fingerprint: missing <peer> argument\n'); return 2; }
      return fingerprint(peer);
    }
    case 'trust': {
      const { trustAdd, trustList } = require('./keys.js');
      const sub = args[1];
      if (sub === 'add') {
        return trustAdd({
          group: parseFlag(args, '--group'),
          peer: parseFlag(args, '--peer'),
          publicKey: parseFlag(args, '--public-key'),
        });
      }
      if (sub === 'list') {
        return trustList({ group: parseFlag(args, '--group') });
      }
      process.stderr.write(`xmesh-agent trust: unknown subcommand "${sub}"; expected add | list\n`);
      return 2;
    }
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
