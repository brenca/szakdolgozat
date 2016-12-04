const BasicMath = require('./examples/math/math')
global.BasicMath = BasicMath
console.log(
  BasicMath.execute(`10 ^ ((10 - 5 + 4) / (6 - 3)), 10, 22/10`)
)