#!/usr/bin/env node
'use strict';

const { version } = require('../../package.json');

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
      '  stop <peer-name>      Graceful shutdown of a running peer (not yet implemented)',
      '  status [<peer-name>]  Report peer state (not yet implemented)',
      '  cost [<peer-name>]    Report cost counters (not yet implemented)',
      '  trace <cmb-id>        Print ancestor lineage for a CMB (not yet implemented)',
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
      process.stderr.write(`xmesh-agent ${cmd}: not implemented yet (scaffold stage)\n`);
      return 3;
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

module.exports = { main };
