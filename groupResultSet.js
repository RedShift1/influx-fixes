'use strict';

/* System imports */
const crossfilter = require('crossfilter2');
const reductio      = require('reductio');

/* Local imports */
const Aggr          = require('./Aggr');
const first         = require('./reductio/first');
const last          = require('./reductio/last');
const fromIndex     = require('./fromIndex');

function reducer(type)
{
    const r = reductio();
    switch(type)
    {
        case Aggr.SUM: return r.sum;
        case Aggr.AVG: return r.avg;
        case Aggr.COUNT: return r.count;
        case Aggr.MIN: return r.min;
        case Aggr.MAX: return r.max;
        case Aggr.MEDIAN: return r.median;
        case Aggr.FIRST: return (accessor) => r.custom(first(accessor));
        case Aggr.LAST: return (accessor) => r.custom(last(accessor));
    }
}

function pick(type)
{
    switch(type)
    {
        case Aggr.SUM: return 'sum';
        case Aggr.AVG: return 'avg';
        case Aggr.FIRST: return 'first';
        case Aggr.LAST: return 'last';
        case Aggr.COUNT: return 'count';
        case Aggr.MIN: return 'min';
        case Aggr.MAX: return 'max';
        case Aggr.MEDIAN: return 'median';
    }
}

function groupResultSet(tsGrouper, reducers, rs)
{
    const cx            = crossfilter(rs);
    const dtDim         = cx.dimension(fromIndex(0));

    const groups        = reducers.map(() => dtDim.group(tsGrouper));
    const fields        = reducers.map(reducer).map((fn, idx) => fn(fromIndex(idx + 1)));
    const pickFns       = reducers.map(pick);
    const count         = reducers.length;

    const aggregates    = fields.map((f, idx) => f(groups[idx]).all());

    return groups[0].all().map(
        ({key}, rowNum) =>
        {
            const arr = new Array(count + 1);
            arr[0] = key;

            for(let i = 0; i < count; i++)
                arr[i + 1] = aggregates[i][rowNum].value[pickFns[i]];

            return arr;
        }
    );
}

module.exports = groupResultSet;