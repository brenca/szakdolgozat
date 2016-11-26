const fs = require('fs-extra')
const EventEmitter = require('events')
const util = require('util')

class Node {
  constructor(rule) {
    this.rule = rule
    this.children = []
  }
  
  toString() {
    if (typeof this.rule === 'string' || this.rule instanceof String) {
      return this.rule
    } else {
      return this.rule.toString()
    }
  }
  
  addChild(child) {
    this.children.push(child)
  }
  
  addChildren(children) {
    this.children = this.children.concat(children)
  }
}

class Rule {
  constructor(name, subrules) {
    this.name = name
    this.subrules = subrules
  }
  
  toString() {
    return this.name
  }
  
  match(str) {
    let tryReduce = (subrules, str) => {
      let rules = []
      subrules.some(subrule => {
        let match = subrule.match(str)
        if (match.return === false) {
          rules = []
          str = false
          return true
        } else {
          let node = new Node(subrule)
          node.addChildren(match.rules)
          rules.push(node)
          str = match.return
        }
      })
      
      return {
        rules: rules,
        return: str
      }
    }
    
    let matches = []
    this.subrules.forEach(subrules => {
      matches.push(tryReduce(subrules, str.slice(0)))
    })
    matches = matches.filter(m => { return m.return !== false })
    
    if (matches.length === 0) return { rules: [], return: false }
    else return matches.reduce((l, c) => {
        return l.return.length > c.return.length ? c:l
      },
      { return: { length: Infinity } }
    )
  }
}

class Terminal {
  constructor(value) {
    this.value = value
  }
  
  toString() {
    return 'Terminal "' + this.value + '"'
  }
  
  match(str) {
    let escape = (s) => {
      return s.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    }
    
    let match = str.match(new RegExp('(^' + escape(this.value) + ')(.*)$'))
    if (match) {
      return { rules: [], return: match[2] }
    } else {
      return { rules: [], return: false }
    }
  }
}

class RuleSet {
  constructor(raw) {
    let set = this
    let separate = (text) => {
      let starters = '<"\'', enders = '>"\'', rules = [[]], last = -1
      
      text.split('').forEach((v, i) => {
        if (v == '|' && last < 0) rules.push([])
        else if (starters.indexOf(v) >= 0 && last < 0) last = i
        else if (enders.indexOf(v) >= 0 && last >= 0 && starters.indexOf(text[last]) === enders.indexOf(v)) {
          let segment
          switch (text[last]) {
            case '<':
              segment = text.substring(last + 1, i)
              break
            case '"': case '\'':
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
  
  buildAST(str) {
    let step = (str) => {
      let matches = []
      this.rules.forEach(rule => {
        console.log(rule.name);
        let match = rule.match(str.slice(0))
        console.log(match);
        matches.push({
          rule: rule,
          rules: match.rules,
          return: match.return
        })
      })
      console.log(matches);
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
    let rules = []
    while (rest.length > 0) {
      console.log(rest);
      let m = step(rest)
      console.log(m);
      if (m.return === rest) return false
      
      let node = new Node(m.rule)
      node.addChildren(m.rules)
      rules.push(node)
      rest = m.return
    }
    
    let node = new Node("start")
    node.addChildren(rules)
    return node
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

let prettyPrint = (ast, offset = 0) => {
  let padding = (new Array(offset * 2 + 1)).join(' ')
  console.log(padding + ast.toString())
  ast.children.forEach(e => {
    prettyPrint(e, offset + 1)
  })
}

let verify = (ast) => {
  let str = (ast.rule instanceof Terminal) ? ast.rule.value : ""
  
  ast.children.forEach(e => {
    str += verify(e)
  })
  
  return str
}

readFile('./definition.bnf').then(raw => {
  let set = new RuleSet(raw)
  // console.log(set);
  // console.log(util.inspect(set.rules[7], false, null))
  let code = `fasd-sasd   asd asd asd \\ ^ $ * + ? . ( ) | { } [ ]`
  let ast = set.buildAST(code)
  // console.log(ast);
  if (ast) {
    prettyPrint(ast)
    console.log(code === verify(ast))
  } else {
    console.log('didn`t match')
  }
})
