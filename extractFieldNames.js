const fieldName = require('./fieldName');

const SELECTORS         = /.*SELECT\s+([^]*)\s+FROM(.*)/i;


module.exports = function(stmt)
{
    return stmt
        .match(SELECTORS)[1]
        .split(/\,\s?(?![^\(]*\))/)
        .map(fieldName);
};