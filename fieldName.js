const NAMEFROMSELECTOR  = /AS[^]*"([^]*)"/i;

module.exports = function(selector)
{
    const m = selector.match(NAMEFROMSELECTOR);
    if(m === null)
        return '';

    return m[1];
};