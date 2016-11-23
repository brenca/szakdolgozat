const fs = require('fs-extra')
const EventEmitter = require('events')

class Rule {
  constructor(name, subrules) {
    this.name = name
    this.subrules = subrules
  }
  
  match(str) {
    let tryReduce = (subrules) => {
      let s = str.slice(0)
      
      subrules.some(subrule => {
        let match = subrule.match(s)
        if (match === false) {
          return true
        } else {
          s = match
        }
      })
      
      return s
    }
    
    let matches = []
    this.subrules.forEach(subrules => {
      matches.push(tryReduce(subrules))
    })
    matches = matches.filter(m => { return m !== false })
    
    if (matches.length === 0) return false
    else return matches.reduce((l, c) => {
        return l.length > c.length ? c:l
      },
      { length: Infinity }
    )
  }
}

class Terminal {
  constructor(value) {
    this.value = value
  }
  
  match(str) {
    let regexp = new RegExp('^' + this.value)
    let match = str.match(new RegExp('(^' + this.value + ')(.*)$'))
    if (match) {
      return match[2]
    } else {
      return false
    }
  }
}

class RuleSet {
  constructor(raw) {
    let set = this
    let separate = (text) => {
      let starters = '<"', enders = '>"', rules = [[]], last = -1
      
      text.split('').forEach((v, i) => {
        if (v == '|' && last < 0) rules.push([])
        else if (starters.indexOf(v) >= 0 && last < 0) last = i
        else if (enders.indexOf(v) >= 0 && last >= 0) {
          let segment
          switch (text[last]) {
            case '<':
              segment = text.substring(last + 1, i)
              break
            case '"':
              segment = new Terminal(text.substring(last + 1, i))
              break
          }
          
          rules[rules.length - 1].push(segment)
          last = -1
        }
      })
      
      return rules
    }
    
    // split definition to array of lines
    let lines = raw.split(/\r?\n/)
    
    // merge definitions into one line
    let data = []
    lines.forEach((v, i) => {
      v = v.replace(/(^\s+)|(\s+$)/g, "")
      if (v.match(/::=/)) 
        data.push(v)
      else
        data[data.length - 1] += " " + v
    })
    
    // remove extra lines and normalize whitespaces
    this.rules = data.filter(d => { 
      return d.length > 0 && d.match(/::=/) 
    }).map(definition => {
      let m = definition.replace(/\s+/g, " ").match(/^<(.+)> ::= (.+)$/i)
      // transform into Rule class (name and array of subrules)
      return new Rule(m[1], separate(m[2]))
    }).map((rule, i, rules) => {
      rule.subrules = rule.subrules.map(subruleseq => {
        return subruleseq.map(subrule => {
          if (typeof subrule === 'string' || subrule instanceof String) {
            return rules.find((r) => { return r.name === subrule })
          } else {
            return subrule
          }
        })
      })
      return rule
    })
  }
  
  parse(str) {
    let step = (str) => {
      let matches = []
      this.rules.forEach(rule => {
        matches.push({
          rule: rule,
          return: rule.match(str.slice(0))
        })
      })
      matches = matches.map(m => {
        m.val = str.replace(m.return, '')
        return m
      }).filter(m => { return m.return !== false })
      
      if (matches.length === 0) return false
      else return matches.reduce((l, c) => {
          return l.return.length > c.return.length ? c:l
        },
        { return: { length: Infinity } }
      )
    }
    
    let rest = str.slice(0)
    while (rest.length > 0) {
      let m = step(rest)
      if (m.return === rest) return false
      
      rest = m.return
    }
    
    return rest
  }
}

let readFile = (file) => {
  return new Promise(function(resolve, reject) {
    fs.readFile(file, 'utf8', (err, data) => {
      if (err) reject(err)
      resolve(data)
    })
  })
}

readFile('./definition.bnf').then(raw => {
  let set = new RuleSet(raw)
  // console.log(set.rules[0].subrules);
  // console.log(set.rules[0].match('   asd asd'));
  
  console.log(set.parse('   asd asd adsdadsdasdasdadsdasda'));
})
