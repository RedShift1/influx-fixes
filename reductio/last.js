'use strict';

module.exports = function(accessor)
{
    return {
        add(p, v)
        {
            p.last = accessor(v);
            return p;
        },
        remove(p, v)
        {
            return p;
        },
        initial(p)
        {
            p.last = null;
            return p;
        }
    }
};