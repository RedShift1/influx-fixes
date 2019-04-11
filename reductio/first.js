'use strict';

module.exports = function(accessor)
{
    return {
        add(p, v)
        {
            if(p.first === null)
                p.first = accessor(v);

            return p;
        },
        remove(p, v)
        {
            return p;
        },
        initial(p)
        {
            p.first = null;
            return p;
        }
    }
};