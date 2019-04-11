'use strict';

module.exports = function(idx)
{
    return function(row)
    {
        return row[idx];
    }
};