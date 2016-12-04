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
      if (v === '|' && last < 0) rules.push([])
      else if (this._starters.indexOf(v) >= 0 && last < 0) last = i
      else if (this._enders.indexOf(v) >= 0 && last >= 0 && 
          this._starters.indexOf(text[last]) === this._enders.indexOf(v)) {
        switch (text[last]) {
          case '<':
            rules[rules.length - 1].push(text.substring(last + 1, i))
            break
          case '"': case '\'':
            if (text.substring(last + 1, i).length === 0)
              rules[rules.length - 1].push(new Parser.Terminal(''))
            else
              rules[rules.length - 1] = rules[rules.length - 1].concat(
                text.substring(last + 1, i).split('').map(c => {
                  return new Parser.Terminal(c)
                })
              )
            break
        }
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
    }))
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
        let sets = []
        set.getItemsWithDotBefore(ad).forEach(idb => {
          sets.push(this.getItemSetForItem(idb))
        })
        sets = [...new Set(sets)]
        
        sets.forEach(s => {
          set._transitions.push({
            input: ad,
            set: s
          })
        })
      })
    })
  }
  
  _createOrGetEGItem(from, to, rule) {
    let item = new Parser.ExtendedGrammarItem(from, to, rule)
    let existing = this._egitems.find(egi => {
      return egi.equals(item)
    })
    
    if (!existing) {
      this._egitems.push(item)
      return item
    }
    return existing
  }
  
  findExtendedGrammar() {
    this._egitems = []
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
        if (set === undefined) throw Error('ambiguous grammar')
        let from = set
        let ts = set._transitions.filter(t => {
          return t.input === input
        })
        
        if (ts.length === 0) {
          return [{
            from: set,
            to: undefined
          }]
        } else {
          return ts.map(t => {
            return {
              from: set,
              to: t.set
            }
          })
        }
      }
      
      findFromTo(item.set, item.item._rule).forEach(ft => {
        let lhs = this._createOrGetEGItem(ft.from, ft.to, item.item._rule)
        
        let rhss = [[]]
        item.item._rule._subrules[item.item._i].forEach(sr => {
          let nrhss = []
          rhss.forEach(rhs => {
            let s = rhs.length > 0 ? rhs[rhs.length - 1]._to : item.set
            
            findFromTo(s, sr).forEach(ft => {
              let nrhs = rhs.slice()
              nrhs.push(this._createOrGetEGItem(ft.from, ft.to, sr))
              nrhss.push(nrhs)
            })
          })
          rhss = nrhss
        })
        
        rhss.forEach(rhs => {
          this._egrules.push(new Parser.ExtendedGrammarRule(lhs, rhs, item.item._i))
        })
      })
    })
  }
  
  _getLHSEGRulesForEGItem(egitem) {
    return this._egrules.filter(r => { 
      return r._lhs.equals(egitem) 
    })
  }
  
  _getRHSEGRulesForEGItem(egitem) {
    return this._egrules.filter(r => { 
      return r._rhs.some(rr => {
        return rr.equals(egitem) 
      })
    })
  }
  
  _isEpsilonRule(r) {
    return r instanceof Parser.Terminal && r._value === ''
  }
  
  _isTerminalRule(r) {
    return r instanceof Parser.Terminal || r._tokenClass !== undefined
  }
  
  _isInArray(x, a) {
    return a.some(y => {
      if (x instanceof Parser.Terminal) return y._value === x._value
      return y === x 
    })
  }
  
  _first(egitem) {
    if (egitem._rule instanceof Parser.Terminal
        || egitem._rule._tokenClass !== undefined) {
      egitem._firsts = [egitem._rule]
      return 0
    } 
    
    let changed = 0
    
    this._getLHSEGRulesForEGItem(egitem).forEach(egrule => {
      if (this._isTerminalRule(egrule._rhs[0]._rule)) {
        if (!this._isInArray(egrule._rhs[0]._rule, egrule._lhs._firsts)) {
          changed++
          egrule._lhs._firsts.push(egrule._rhs[0]._rule)
        }
      } else {
        if(!egrule._rhs.some(r => {
          if (r._rule instanceof Parser.Rule) {
            let hasEpsilon = false
            
            r._firsts.forEach(f => {
              if (!this._isEpsilonRule(f)) {
                if (!this._isInArray(f, egrule._lhs._firsts)) {
                  changed++
                  egrule._lhs._firsts.push(f)
                }
              } else {
                hasEpsilon = true
              }
            })
            
            return !hasEpsilon
          } else {
            return true
          }
        })) {
          let epsilon = new Parser.Terminal('')
          if (!this._isInArray(epsilon, egrule._lhs._firsts)) {
            changed++
            egrule._lhs._firsts.push(epsilon)
          }
        }
      }
    })
    
    return changed
  }
  
  calculateFirsts() {
    let changed
    do {
      changed = 0
      this._egitems.forEach(egitem => {
        changed += this._first(egitem)
      })
    } while (changed > 0)
  }
  
  _follow(egitem) {
    if (egitem._rule instanceof Parser.Terminal
        || egitem._rule._tokenClass !== undefined) {
      egitem._follows = []
      return 0
    }
    
    let changed = 0
    
    this._getRHSEGRulesForEGItem(egitem).forEach(egrule => {
      let index = egrule._rhs.indexOf(egitem)
      if (index === egrule._rhs.length - 1) {
        
        egrule._lhs._follows.forEach(f => {
          if (!this._isInArray(f, egitem._follows)) {
            changed++
            egitem._follows.push(f)
          }
        })
      } else {
        let firsts = egrule._rhs[index + 1]._firsts
        
        let hasEpsilon = false
        firsts.forEach(f => {
          if (!this._isEpsilonRule(f)) {
            if (!this._isInArray(f, egitem._follows)) {
              changed++
              egitem._follows.push(f)
            }
          } else {
            hasEpsilon = true
          }
        })
        
        if (hasEpsilon) {
          egrule._lhs._follows.forEach(f => {
            if (!this._isInArray(f, egitem._follows)) {
              changed++
              egitem._follows.push(f)
            }
          })
        }
      }
    })
    
    return changed
  }
  
  calculateFollows() {
    this._egitems[0]._follows.push(this.findRule('Token-EOL'))
    
    let changed
    do {
      changed = 0
      this._egitems.forEach(egitem => {
        changed += this._follow(egitem)
      })
    } while (changed > 0)
  }
  
  mergeEGRules() {
    let mergedRules = []
    
    this._egrules.forEach(egr => {
      let similar = this._egrules.filter(r => {
        return egr.isMergeableWith(r)
      })
      
      if (!mergedRules.some(mr => {
        return mr.rule === similar[0]._lhs._rule 
            && mr.finalSet === similar[0]._getFinalSet()
      })) {
        mergedRules.push({
          rule: similar[0]._lhs._rule,
          i: similar[0]._i,
          follows: [...new Set([].concat.apply([], similar.map(s => { 
            return s._lhs._follows 
          })))],
          finalSet: similar[0]._getFinalSet()
        })
      }
    })
    
    return mergedRules
  }
  
  calculateActionsAndGotos() {
    this._itemSets.forEach(set => {
      set._actions = []
      set._gotos = []
      
      set._transitions.forEach(t => { 
        if (t.input instanceof Parser.Rule 
            && t.input._tokenClass === undefined) {
          set._gotos.push(new Parser.Goto(t.input, t.set))
        } else {
          set._actions.push(new Parser.Shift(t.input, t.set))
        }
      })
      
      if (set._items.some(item => {
        if (item._rule.name === '#S'
            && item._dot === item._rule._subrules.length) {
          return true
        }
      })) {
        set._actions.push(new Parser.Accept(this.findRule('Token-EOL')))
      }
    })
    
    this.mergeEGRules().forEach(mr => {
      mr.follows.forEach(f => {
        if (mr.finalSet !== undefined) {
          let action = mr.finalSet._actions.find(a => {
            return a._input === f
          })
          
          if (action === undefined)
            mr.finalSet._actions.push(new Parser.Reduce(f, mr.rule, mr.i))
          else {
            if (action instanceof Parser.Reduce) 
              throw Error("reduce-reduce conflict")
            else if (!(action instanceof Parser.Accept)) {
              mr.finalSet._actions = mr.finalSet._actions.filter(a => {
                return a._input !== f
              })
              mr.finalSet._actions.push(new Parser.Reduce(f, mr.rule, mr.i))
            }
          }  
        }
      })
    })
  }
  
  printActionGotos() {
    this._itemSets.forEach(is => {
      console.log(is._index)
      is._actions.forEach(a => {
        let v = (a._input instanceof Parser.Terminal) ? 
          a._input._value : a._input._tokenClass.name
        let classname
        if (a instanceof Parser.Accept) 
          classname = 'Accept'
        if (a instanceof Parser.Shift) 
          classname = 'Shift(' + a._itemSet._index + ')'
        if (a instanceof Parser.Reduce) 
          classname = 'Reduce(' + a._rule.allToString(a._i) + ')'
        console.log(v + ' - ' + classname)
      })
      is._gotos.forEach(g => {
        console.log(g._input + ' - ' + g._to._index)
      })
      console.log()
    })
  }
  
  printExtendedGrammarRules() {
    this._egrules.forEach(egr => {
      egr.print()
    })
  }
  
  printExtendedGrammarItems() {
    this._egitems.forEach(egi => {
      egi.print()
    })
  }
  
  printItemSets() {
    this._itemSets.forEach(set => {
      console.log(set._index + ": ")
      set.print()
      console.log()
      set._transitions.forEach(tr => {
        console.log(tr.input.toString() + " -> " + tr.set._index)
      })
      console.log()
    })
  }
  
  determineWhatToDo() {
    let stack = this._state.stack
    
    let action = stack[stack.length - 1]._actions.find(a => {
      if (a._input._value !== undefined) {
        if (a._input._value === this._state.input[0].value)
          return a
      } else if (a._input._tokenClass !== undefined) {
        if (a._input._tokenClass === this._state.input[0]._tokenClass)
          return a
        if (a._input._tokenClass === this._state.input[0].class)
          return a
      }
    })
    
    if (action === undefined) {
      action = stack[stack.length - 1]._actions.find(a => {
        if (a._input._value !== undefined) {
          if (a._input._value === '')
            return a
        }
      })
    }
    
    // console.log()
    // console.log(stack[stack.length - 1]._actions)
    // console.log(this._state.input[0])
    // console.log(action);

    if (action === undefined) 
      throw new Parser.SyntaxError(this._state.input[0])
    return action
  }
  
  parse(code) {
    this.findItemSets()
    this.findExtendedGrammar()
    this.calculateFirsts()
    this.calculateFollows()
    this.calculateActionsAndGotos()
    
    this._state = {
      input: code.concat([this.findRule('Token-EOL')]),
      index: 0,
      output: [],
      nodes: [],
      stack: [this._itemSets[0]]
    }
    
    try {
      while(this.determineWhatToDo().execute(this)) {
        // console.log(this._state);
      }
    } catch (e) {
      let line = 1
      let char = 0
      
      for (var i = 0; i < this._state.index; i++) {
        if (this._state.index > code.length)
          throw Error('SyntaxError: unexpected end of file')
        if (code[i].class instanceof Lexer.EOLTokenClass) {
          line++
          char = 0
        } else {
          char ++
        }
      }
      
      throw Error('SyntaxError: unexpected token "' + 
                  e._input.value + '" ' + line + ':' + char)
    } 
    
    this._state.nodes.forEach(o => {
      o.reduce()
      // console.log(o.toString())
    })
    
    return this._state.nodes
  }
}

Parser.Node = class {
  constructor(rule, children) {
    this._rule = rule
    this._children = children
  }
  
  reduce() {
    while (this._children.length === 1) {
      this._rule = this._children[0]._rule
      this._children = this._children[0]._children
    }
    
    this._children.forEach(c => {
      c.reduce()
    })
  }
  
  toString(ident = 0) {
    let identation = (new Array((ident) * 2)).join(' ')

    if (this._rule.name !== undefined) {
      let parameters = this._children.map(c => {
        return c.toString(ident + 1)
      }).join('\n')
      
      return identation + this._rule.name
          + '(\n' + parameters + '\n' + identation + ')'
    } else {
      return identation + '"' + encodeURI(this._rule.value) + '"'
    }    
  }
}

Parser.Action = class {
  constructor(input) {
    this._input = input
  }
  
  execute(parser) {}
}

Parser.Accept = class extends Parser.Action {
  constructor(input) {
    super(input)
  }
  
  execute(parser) {
    super.execute(parser)
    return false
  }
}

Parser.Reduce = class extends Parser.Action {
  constructor(input, rule, i) {
    super(input)
    this._rule = rule
    this._i = i
  }
  
  execute(parser) {
    super.execute(parser)
    parser._state.output.push({
      rule: this._rule, 
      i: this._i
    })
    let num = this._rule._subrules[this._i].length
    parser._state.stack.splice(
      parser._state.stack.length - num, 
      parser._state.stack.length)
      
    let d = parser._state.nodes.splice(
      parser._state.nodes.length - num, 
      parser._state.nodes.length)
      
    parser._state.nodes.push(new Parser.Node(this._rule, d))
      
    let goto = parser._state.stack[parser._state.stack.length - 1]
      ._gotos.find(g => {
        return g._input === this._rule
      })
      
    if (goto === undefined)
      throw new Parser.SyntaxError(parser._state.input[0])
    return goto.execute(parser)
  }
}

Parser.Shift = class extends Parser.Action {
  constructor(input, itemSet) {
    super(input)
    this._itemSet = itemSet
  }
  
  execute(parser) {
    super.execute(parser)
    parser._state.stack.push(this._itemSet)
    if (this._input._value === undefined || this._input._value.length === 1) {
      parser._state.index++
      parser._state.nodes.push(new Parser.Node(parser._state.input.shift(), []))
    }
    return true
  }
}

Parser.Goto = class extends Parser.Action {
  constructor(input, to) {
    super(input)
    this._to = to
  }
  
  execute(parser) {
    super.execute(parser)
    parser._state.stack.push(this._to)
    return true
  }
}

Parser.ExtendedGrammarRule = class {
  constructor(lhs, rhs, i) {
    this._lhs = lhs
    this._rhs = rhs
    this._i = i
  }
  
  isMergeableWith(egr) {
    if (egr._lhs._rule === this._lhs._rule 
        && egr._getFinalSet() === this._getFinalSet()) {
      return true
    } else {
      return false
    }
  }
  
  _getFinalSet() {
    return this._rhs[this._rhs.length - 1]._to
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
    this._firsts = []
    this._follows = []
  }
  
  equals(item) {
    return this._from === item._from
        && this._to === item._to 
        && this._rule === item._rule
  }
  
  print() {
    let ret = this.toString()
    
    ret += '\nFI: '
    this._firsts.forEach(r => {
      ret += r.toString() + ' '
    })
    ret += '\nFO: '
    this._follows.forEach(r => {
      ret += r.toString() + ' '
    })
    
    console.log(ret + '\n')
  }
  
  toString() {
    return (this._from._index 
         + this._rule.toString() 
         + (this._to ? this._to._index : '$')
    )
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
  
  toString() {
    return this.name
  }
  
  allToString(i) {
    return this.toString() + ' -> ' + (this._subrules[i].map(r => {
      return r.toString()
    }).join(' '))
  }
}

Parser.Terminal = class {
  constructor(value) {
    this._value = value
  }
  
  toString() {
    return '"' + this._value + '"'
  }
}

Parser.SyntaxError = class {
  constructor(input) {
    this._input = input
  }
}

module.exports = Parser