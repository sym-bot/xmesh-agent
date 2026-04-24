'use strict';

module.exports = {
  WakeBudget: require('./safety/budget.js').WakeBudget,
  detectCycle: require('./safety/cycle.js').detectCycle,
  version: require('../package.json').version,
};
