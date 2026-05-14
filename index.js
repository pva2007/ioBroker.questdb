'use strict';

const factory = require('./build/main');

if (require.main !== module) {
    module.exports = factory;
} else {
    factory();
}
