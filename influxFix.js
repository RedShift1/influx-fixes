const GROUPINGTOFIX     = /(.*GROUP\s+BY[^]*time)\(\d+([nv])\)/i;
const HASGROUPING       = /(.*GROUP\s+BY[^]*time)\(\d+(ns|u|ms|s|m|h|d|w|n|v)\)(.*)/i;
const SELECTORS         = /.*SELECT\s+([^]*)\s+FROM(.*)/i;
const SELECTOR          = /([A-Za-z]*)\(?[^]*\)?(AS([^]*))?/i;
const FILL              = /.*FILL\(([^)]+)\).*/i;
const GROUPTIME         = /.*GROUP\s+BY[^]*time\((\d+)(ns|u|ms|s|m|h|d|w|n|v)\).*/i;
const TZ                = /.*TZ\('([^]*)'\).*/i;
const START             = /.+WHERE[^]+time\s*(>|>=)\s*(\d+)ms/i;
const END               = /.+WHERE[^]+time\s*(<|<=)\s*(\d+)ms/i;
const froms             = /.+FROM([^]*)WHERE/i;

const FILL_NONE         = 'none';

const Aggr         = require('./Aggr');
const TimeUnit      = require('./TimeUnit');
const groupResultSet    = require('./groupResultSet');
const { extendMoment }  = require('moment-range');
const moment        = extendMoment(require('moment-timezone'));
const passthrough       = require('./passthrough');
const extractFieldNames = require('./extractFieldNames');

const fnMap =
{
    COUNT:  Aggr.COUNT,
    MEAN:   Aggr.AVG,
    MEDIAN: Aggr.MEDIAN,
    SUM:    Aggr.SUM,
    FIRST:  Aggr.FIRST,
    LAST:   Aggr.LAST,
    MIN:    Aggr.MIN,
    MAX:    Aggr.MAX,
};

const ifxTimeMap =
{
    ms: TimeUnit.MILLISECONDS,
    s: TimeUnit.SECONDS,
    m: TimeUnit.MINUTES,
    h: TimeUnit.HOURS,
    d: TimeUnit.DAYS,
    w: TimeUnit.ISOWEEKS,
    n: TimeUnit.MONTHS,
    v: TimeUnit.YEARS
};

const timeUnitToMoment =
{
    [TimeUnit.DAYS]:            'days',
    [TimeUnit.ISOWEEKS]:        'weeks',
    [TimeUnit.HOURS]:           'hours',
    [TimeUnit.MINUTES]:         'minutes',
    [TimeUnit.MILLISECONDS]:    'milliseconds',
    [TimeUnit.MONTHS]:          'months',
    [TimeUnit.SECONDS]:         'seconds',
    [TimeUnit.YEARS]:           'years'
};

function extractFns(stmt)
{
    const functions = stmt
        .match(SELECTORS)[1]
        .split(',')
        .map(s => s.trim().toUpperCase())
        .map(s => s.match(SELECTOR)[1]);

    // When doing a COUNT, Influx returns the count for each bucket,
    // thus we need to sum the results, otherwise we're just counting
    // the number of records returned.
    return functions.map(fn =>
        {
            if(fn === 'COUNT')
                return fnMap.SUM;
            else
            {
                if(fnMap[fn] === undefined)
                    throw new Error(`Function ${fn} is not supported`);

                return fnMap[fn];
            }

        }
    );
}



/**
 * Searches for an unsupported duration and replaces it with a duration of
 * one day
 * @param input The original CQL
 * @return {string} Patched CQL
 */
function patchCQL(input)
{
    return input.replace(GROUPINGTOFIX, '$1(1d)');
}

/**
 * Create a function to round down a date to a certain time unit and step
 * @param {TimeUnit} timeUnit
 * @param {number} n Step to round down to
 * @param {string} tz Timezone
 * @return {function(*=): number} Function that
 */
function calendarBucket(timeUnit, n, tz)
{
    if(tz === undefined) tz = 'UTC';

    return function(ts)
    {
        const m     = moment(ts).tz(tz);
        const num   = Math.floor(m.get(timeUnit) / n) * n;

        m.set(timeUnit, num);

        return m.startOf(timeUnit).valueOf();
    };
}

function generateRange(start, end, tz, timeUnit, step)
{
    const thisStep  = step === undefined ? 1 : step;
    const result    = [];

    const startMoment   = moment.utc(start).tz(tz).startOf(timeUnit);
    const endMoment     = moment.utc(end).tz(tz);

    for (let x of moment.range(startMoment, endMoment).by(timeUnit, { step: thisStep }))
    {
        if(x < endMoment)
            result.push(x.valueOf());
    }

    return result;
}

function generateFill(start, end, fill, tz, timeUnit, step, fieldCount)
{
    const range = generateRange(start, end, tz, timeUnit, step);

    return range.map(ts =>
        {
            const a = new Array(fieldCount + 1).fill(fill);
            a[0] = ts;
            return a;
        }
    );
}

function parseFill(fillStmtMatch)
{
    let ret = null;

    switch(fillStmtMatch[1])
    {
        case 'none':
            ret = null;
            break;
        case 'null':
            ret = null;
            break;
        default:
            ret = parseInt(fillStmtMatch[1]);
    }

    return ret;
}

function substituteFill(cql, tz, timeUnit, step, fieldCount)
{
    const start = cql.match(START);
    const end   = cql.match(END);
    const fill  = cql.match(FILL);

    if(start === null || end === null || fill === null)
        return passthrough;

    if(fill[1] === FILL_NONE)
        return passthrough;

    const startMs   = parseInt(start[2]);
    const endMs     = parseInt(end[2]);
    const realFill  = parseFill(fill);
    const columns   = ['time', ...extractFieldNames(cql)];

    return function(rs)
    {
        if(rs.results[0].series)
            return rs;

        const fillTimeUnit = timeUnitToMoment[timeUnit];

        const values = generateFill(startMs, endMs, realFill, tz, fillTimeUnit, step, fieldCount);

        rs.results[0].series = [{columns, values}];

        return rs;
    }
}


/**
 * @param cql
 * @return {{cql: string, apply: function(*)}}
 */
module.exports = function(cql)
{
    const stripped = cql.replace(/\r/g, '').replace(/\n/g, ' ');

    if(cql.match(HASGROUPING) === null)
        return { cql: stripped, apply: passthrough };

    const tzMatches = stripped.match(TZ);
    const timeZone = tzMatches === null ? 'UTC' : tzMatches[1];
    const [full, lit, unit] = cql.match(GROUPTIME);
    const timeUnit = ifxTimeMap[unit];
    const reducers  = extractFns(stripped);
    const tsGrouper = calendarBucket(timeUnit, lit, timeZone);

    if(cql.match(GROUPINGTOFIX) === null)
        return { cql: stripped, apply: substituteFill(stripped, timeZone, timeUnit, lit, reducers.length) };

    /**
     * @param rs
     * @return {*}
     */
    function apply(rs)
    {
        if(rs.results[0].series !== undefined)
        {
            const values = rs.results[0].series[0].values;
            rs.results[0].series[0].values = groupResultSet(tsGrouper, reducers, values);
        }

        return substituteFill(stripped, timeZone, timeUnit, lit, reducers.length)(rs);
    }

    return { cql: patchCQL(stripped), apply };
};