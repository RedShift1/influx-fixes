const Influx = require('influx');
const util = require('util');
const influxFix = require('./influxFix');


const influx = new Influx.InfluxDB({
    host: '10.1.7.4',
    database: '_internal'
});

const cql = `SELECT MAX("pointsWrittenOK") FROM "_internal"."monitor"."httpd" WHERE time >= 1523455536302ms AND time < 1554991550967ms GROUP BY time(1n) FILL(null)`;

const fix = influxFix(cql);

console.log(fix.cql);

influx.queryRaw(fix.cql, {precision: Influx.Precision.Milliseconds}).then(
    data =>
    {
        const fixed = fix.apply(data);
        console.log(util.inspect(fixed, false, null));
    }
);

