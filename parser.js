const Lexer = require('./lexer');

class Parser {
  constructor(parent, bnf) {
    this._parent = parent
    this._starters = '<"\''
    this._enders   = '>"\''
    this._rules = []
    if (bnf !== undefined)
      this.fromBNF(bnf)
  }
  
  _separate(text) {
    let rules = [[]], last = -1
    
    text.split('').forEach((v, i) => {
      if (v == '|' && last < 0) rules.push([])
      else if (this._starters.indexOf(v) >= 0 && last < 0) last = i
      else if (this._enders.indexOf(v) >= 0 && last >= 0 && 
          this._starters.indexOf(text[last]) === this._enders.indexOf(v)) {
        let segment
        switch (text[last]) {
          case '<':
            segment = text.substring(last + 1, i)
            break
          case '"': case '\'':
            segment = new Parser.Terminal(text.substring(last + 1, i))
            break
        }
        
        rules[rules.length - 1].push(segment)
        last = -1
      }
    })
    
    return rules
  }
  
  _splitAndMerge(bnf) {
    let rules = []
    
    bnf.split(/\r?\n/).forEach((v, i) => {
      v = v.replace(/(^\s+)|(\s+$)/g, "")
      
      if (v.match(/::=/)) rules.push(v)
      else rules[rules.length - 1] += " " + v
    })
    
    return rules.filter(d => { 
      return d.length > 0 && d.match(/::=/) 
    })
  }
  
  _resolveSubrules() {
    this._rules = this._rules.map(rule => {
      rule._subrules = rule._subrules.map(subruleSequence => {
        return subruleSequence.map(name => {
          if (typeof name === 'string' || name instanceof String) {
            let subrule = this.findRule(name)
            if (subrule === undefined) 
              throw ReferenceError('"' + name + '" is not a valid rule')
            return subrule
          } else if (name instanceof Parser.Rule 
              || name instanceof Parser.Terminal) {
            return name
          } else throw TypeError('"' + name + '" is not a ' + 
                                 'Parser.Rule or Parser.Terminal')
        })
      })
      return rule
    })
  }
  
  findRule(name) {
    return this._rules.find(r => { return r.name === name })
  }
  
  fromBNF(bnf) {
    this._rules = this._splitAndMerge(bnf).map(definition => {
      let m = definition.replace(/\s+/g, " ").match(/^<(.+)> ::= (.+)$/i)
      return new Parser.Rule(m[1], this._separate(m[2]))
    }).concat(this._parent.lexer._classes.map(c => {
      return new Parser.Rule('Token-' + c.name, c)
    })).concat([new Parser.Rule('EOL', [[new Parser.Terminal('\n\r')]])])
    this._rules.unshift(new Parser.Rule('#S', [[this._rules[0].name]]))
    
    this._resolveSubrules()
  }
  
  getItemSetForItem(item) {
    let ret = undefined
    
    this._itemSets.some(set => {
      set._items.some(i => {
        if (i.equals(item)) {
          ret = set
          return true
        }
      })
    })
    
    return ret
  }
  
  isItemSetStarter(item) {
    return this._itemSets.some(set => {
      return set._items[0].equals(item)
    })
  }
  
  findItemSets() {
    let start = new Parser.Item(this.findRule('#S'), 0, 0)
    this._itemSets = [new Parser.ItemSet(0, start, this._rules)]
    
    let index = 0
    while (true) {
      this._itemSets[index].getAfterDotSet().forEach(ad => {
        let itemsBefore = this._itemSets[index].getItemsWithDotBefore(ad)
        
        if (!itemsBefore.some(i => this.isItemSetStarter(i))) {
          this._itemSets.push(new Parser.ItemSet(
            this._itemSets.length,
            itemsBefore, 
            this._rules
          ))
        }
      })
      index++
      if (index >= this._itemSets.length) break
    }
    
    this._itemSets.forEach(set => {
      set.getAfterDotSet().forEach(ad => {
        set._transitions.push({
          input: ad,
          set: this.getItemSetForItem(set.getItemsWithDotBefore(ad)[0])
        })
      })
    })
  }
  
  findExtendedGrammar() {
    this._egrules = []
    
    let items = []
    this._itemSets.forEach(set => {
      set._items.forEach(item => {
        if (item._dot === 0) {
          items.push({
            set: set,
            item: item
          })
        }
      })
    })
    
    items.forEach(item => {
      let findFromTo = (set, input) => {
        let from = set._index
        let t = set._transitions.find(t => {
          return t.input === input
        })
        let to = t ? t.set._index : '$'
        
        return {
          from,
          to,
          toset: t ? t.set : null
        }
      }
      
      let ft = findFromTo(item.set, item.item._rule)
      let lhs = new Parser.ExtendedGrammarItem(ft.from, ft.to, item.item._rule)
      
      let rhs = []
      let cset = item.set
      item.item._rule._subrules[item.item._i].forEach(sr => {
        let ft = findFromTo(cset, sr)
        rhs.push(new Parser.ExtendedGrammarItem(ft.from, ft.to, sr))
        cset = ft.toset
      })
      
      this._egrules.push(new Parser.ExtendedGrammarRule(lhs, rhs))
    })
  }
  
  printExtendedGrammarRules() {
    this._egrules.forEach(egr => {
      egr.print()
    })
  }
  
  printItemSets() {
    this._itemSets.forEach(set => {
      console.log(set._index + ": ")
      set.print()
      console.log()
      set._transitions.forEach(tr => {
        let name = tr.input instanceof Parser.Terminal ? 
          '"' + tr.input._value + '"' : tr.input.name
        console.log(name + " -> " + tr.set._index)
      })
      console.log()
    })
  }
  
  parse(code) {
    return code
  }
}

Parser.ExtendedGrammarRule = class {
  constructor(lhs, rhs) {
    this._lhs = lhs
    this._rhs = rhs
  }
  
  print() {
    let ret = this._lhs.toString() + ' -> '
    
    this._rhs.forEach(r => {
      ret += r.toString() + ' '
    })
    
    console.log(ret)
  }
}

Parser.ExtendedGrammarItem = class {
  constructor(from, to, rule) {
    this._from = from
    this._to = to
    this._rule = rule
  }
  
  toString() {
    let name = this._rule instanceof Parser.Terminal ? 
      '"' + this._rule._value + '"' : this._rule.name
    return this._from + name + this._to
  }
}

Parser.ItemSet = class {
  constructor(index, starter, rules) {
    this._index = index
    this._items = []
    this._transitions = []
    
    if (starter !== undefined && rules !== undefined) {
      if (starter.constructor !== Array)
        this.add(starter)
      else
        this._items = starter
      this.expand(rules)
    }
  }
  
  add(item) {
    this._items.push(item)
  }
  
  isIncluded(rule) {
    return this._items.find(i => { 
      return i._rule === rule && i._dot === 0 
    }) !== undefined
  }
  
  getAfterDotSet() {
    let afterdot = []
    this._items.forEach(item => {
      afterdot.push(item.getRuleAferDot())
    })
    
    return [...new Set(afterdot)].sort((a, b) => {
      if (a instanceof Parser.Terminal) return -1
      if (b instanceof Parser.Terminal) return 1
      return 0
    }).filter(item => item !== undefined)
  }
  
  getItemsWithDotBefore(rule) {
    let dotbefore = []
    this._items.forEach(item => {
      if (item.getRuleAferDot() === rule) {
        dotbefore.push(new Parser.Item(item._rule, item._i, item._dot + 1))
      }
    })
    return dotbefore
  }
  
  expand(rules) {
    let pushed = 0
    this._items.forEach(item => {
      let afterdot = item.getRuleAferDot()
      if (afterdot !== undefined 
          && afterdot instanceof Parser.Rule
          && !this.isIncluded(afterdot)) {
        afterdot._subrules.forEach((sr, index) => {
          this._items.push(new Parser.Item(afterdot, index, 0))
          pushed ++
        })
      }
    })
    
    if (pushed > 0) this.expand(rules)
  }
  
  print() {
    this._items.forEach(item => {
      item.print()
    })
  }
}

Parser.Item = class {
  constructor(rule, i, dot) {
    this._rule = rule
    this._i = i
    this._dot = dot
  }
  
  getRuleAferDot() {
    return this._rule._subrules[this._i][this._dot]
  }
  
  print() {
    let res = this._rule.name + " -> "
    
    this._rule._subrules[this._i].forEach((sr, i) => {
      if (i === this._dot) res += '.'
      if (sr instanceof Parser.Rule)
        res += sr.name + " "
      else
        res += '"' + sr._value + '" '
    })
    if (this._rule._subrules[this._i].length === this._dot) res += '.'
    
    console.log(res)
  }
  
  equals(item) {
    return this._rule === item._rule 
        && this._i === item._i 
        && this._dot === item._dot
  }
}

Parser.Rule = class {
  constructor(name, subrules) {
    this.name = name
    if (subrules instanceof Lexer.TokenClass) {
      this._tokenClass = subrules
      this._subrules = []
    } else {
      this._subrules = subrules
    }
  }
}

Parser.Terminal = class {
  constructor(value) {
    this._value = value
  }
}

module.exports = Parser