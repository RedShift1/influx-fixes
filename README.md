# influx-fixes

This is some Node JS code to fix InfluxDB's inability to group results by
months and years. Queries like this work:

`SELECT MAX("pointsWrittenOK") FROM "_internal"."monitor"."httpd" WHERE time >= 1523455536302ms AND time < 1554991550967ms GROUP BY time(1n) FILL(null)`

The way it works is it filters out the selectors (MAX(...)), the time
statements, the GROUP BY time and the FILL statements from the query.
When it recognizes you want to group by months or years, it replaces the time
statement with "GROUP BY time(1d)" and recalculates the result by aggregating
days into months or years.

Support time GROUP BY:
* time(1n): group by 1 month
* time(2n): group by 2 months
* ...
* time(1v): group by 1 year
* time(2v): group by 2 years
*...

Supported aggregations:
* SUM
* COUNT
* FIRST
* LAST
* MEAN (the result is not entirely correct because it creates an average of averages: https://math.stackexchange.com/questions/95909/why-is-an-average-of-an-average-usually-incorrect)
* MIN
* MAX

# Using it

First run your original CQL through the influxFix function:

`const fix = influxFix(cql);`

This will return an object with two properties
* cql: String containing the patched CQL to be executed by InfluxDB
* apply: a function that will reprocess the results from InfluxDB
         to adhere to your original CQL. Its input is the data from
         InfluxDB, its output is the fixed result set aggregated by
         months or years.
         If the CQL does not require fixing, this apply function is
         a passthrough function that does not alter the initial result

```
influx.queryRaw(fix.cql, {precision: Influx.Precision.Milliseconds}).then(
    data =>
    {
        const fixed = fix.apply(data);
        console.log(util.inspect(fixed, false, null));
    }
);

```

# Some notes
* You must use precision set to Milliseconds for this to work!
* The detection and fixing up of the CQL happens through regular expressions, 
  so it is quite delicate. You will have to test whether it works for your
  queries or not.

This is some really stupid code to fix an even more stupid problem but a real
business need. YMMV. 0 out of 10 would not recommend in production.