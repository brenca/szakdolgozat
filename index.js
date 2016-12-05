const BasicMath = require('./examples/math')
global.BasicMath = BasicMath
console.log(
  BasicMath.execute(`10 ^ ((10 - 5 + 4) / (6 - 3)), 10, 22/10`)
)

const Logo = require('./examples/logo')
global.Logo = Logo
let l = new Logo(p => {
  console.log(p)
})
l.execute(`for 5+5 [f 10^2 r 91.4 for 2 [r 1 l 1]]`)