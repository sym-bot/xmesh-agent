#!/usr/bin/env node
'use strict';

const { version } = require('../../package.json');

const COMMANDS = ['run', 'stop', 'status', 'cost', 'trace'];

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
      '  status [<peer-name>]  Report peer state, budget usage, cost',
      '  cost [<peer-name>]    Report token + cost counters',
      '  trace <cmb-id>        Print ancestor lineage for a CMB',
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

function main(argv) {
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
  if (!COMMANDS.includes(cmd)) {
    process.stderr.write(`xmesh-agent: unknown command "${cmd}". Try --help.\n`);
    return 2;
  }
  process.stderr.write(
    `xmesh-agent ${cmd}: not implemented yet (scaffold stage). See sym-strategy/architecture/xmesh_runtime_v0.1.md §6.1 for Phase-1 scope.\n`,
  );
  return 3;
}

if (require.main === module) {
  process.exit(main(process.argv));
}

module.exports = { main };
