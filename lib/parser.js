const Lexer = require('./lexer');

// helper function to determine if an item is in an array
function _isInArray(x, a) {
  return a.some(y => {
    if (x instanceof Parser.BNFTerminal) return y.value === x.value
    return y === x 
  })
}

class Parser {
  constructor(parent, bnf) {
    this._parent = parent
    // for bnf parsing
    this._starters = '<"\''
    this._enders   = '>"\''
    this._rules = []
    if (bnf !== undefined)
      this.fromBNF(bnf)
  }
  
  // parses the BNF grammar that it gets as a parameter into Parser.BNFRules and
  // Parser.BNFTerminals
  fromBNF(bnf) {
    let separate = (text) => {
      let rules = [[]], last = -1
      
      // parse iteratively by character because of characters with sepcial 
      // meaning (which can still be part of a string literal)
      text.split('').forEach((v, i) => {
        if (v === '|' && last < 0) rules.push([])
        else if (this._starters.indexOf(v) >= 0 && last < 0) last = i
        else if (this._enders.indexOf(v) >= 0 && last >= 0 && 
            this._starters.indexOf(text[last]) === this._enders.indexOf(v)) {
          switch (text[last]) {
            case '<':
              let name = text.substring(last + 1, i)
              if (!name.match(/^[a-z]+[a-z0-9-]*$/i))
                throw Error('Invalid BNF')
              rules[rules.length - 1].push(name)
              break
            case '"': case '\'':
              rules[rules.length - 1].push(
                new Parser.BNFTerminal(text.substring(last + 1, i))
              )
              break
          }
          last = -1
        } else if (last === -1 && !v.match(/\s/)) {
          throw Error('Invalid BNF')
        }
      })
      return rules
    }
    
    // split by lines and merge multi line rules into one line
    let splitAndMerge = (bnf) => {
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
    
    // map all lines into their respective rules and add rules from Lexer
    this._rules = splitAndMerge(bnf).map(definition => {
      let m = definition.replace(/\s+/g, " ").match(/^<(.+)> ::= (.+)$/i)
      if (!m[1].match(/^[a-z]+[a-z0-9-]*$/i))
        throw Error('Invalid BNF')
      return new Parser.BNFRule(m[1], separate(m[2]))
    }).concat(this._parent.lexer._classes.map(c => {
      return new Parser.BNFRule('Token-' + c.name, c)
    }))
    // add special starter rule for grammar
    this._rules.unshift(new Parser.BNFRule('#S', [[this._rules[0].name]]))
    
    // match the rule names to the rule references in the subrule lists
    this._rules = this._rules.map(rule => {
      rule.subrules = rule.subrules.map(subruleSequence => {
        return subruleSequence.map(name => {
          if (typeof name === 'string' || name instanceof String) {
            let subrule = this._findRule(name)
            if (subrule === undefined) 
              throw ReferenceError('"' + name + '" is not a valid rule')
            return subrule
          } else if (name instanceof Parser.BNFRule 
              || name instanceof Parser.BNFTerminal) {
            return name
          } else throw TypeError('"' + name + '" is not a ' + 
                                 'Parser.BNFRule or Parser.BNFTerminal')
        })
      })
      return rule
    })
  }
  
  _findRule(name) {
    return this._rules.find(r => { return r.name === name })
  }
  
  // finds the canonical collection of LR(0) items and the 
  // translation table elements
  _findItemSets() {
    let isItemSetStarter = (item) => {
      return this._itemSets.some(set => {
        return set.items[0].equals(item)
      })
    }
    
    let getItemSetForItem = (item) => {
      let ret = undefined
      
      this._itemSets.some(set => {
        set.items.some(i => {
          if (i.equals(item)) {
            ret = set
            return true
          }
        })
      })
      
      return ret
    }
    
    let start = new Parser._LR0Item(this._findRule('#S'), 0, 0)
    this._itemSets = [new Parser._LR0ItemSet(start, this._rules)]
    
    let index = 0
    while (true) {
      this._itemSets[index].getAfterDotSet().forEach(ad => {
        let itemsBefore = this._itemSets[index].createItemsWithDotBefore(ad)
        
        if (!itemsBefore.some(i => isItemSetStarter(i))) {
          this._itemSets.push(new Parser._LR0ItemSet(
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
        set.createItemsWithDotBefore(ad).forEach(idb => {
          sets.push(getItemSetForItem(idb))
        })
        sets = [...new Set(sets)]
        
        sets.forEach(s => {
          set.translationTable.push({
            input: ad,
            set: s
          })
        })
      })
    })
  }
  
  // finds the extended grammar elements
  _findExtendedGrammar() {
    this._egitems = []
    this._egrules = []
    
    let createOrGetEGItem = (from, to, rule) => {
      let item = new Parser._ExtendedGrammarItem(from, to, rule)
      let existing = this._egitems.find(egi => {
        return egi.equals(item)
      })
      
      if (!existing) {
        this._egitems.push(item)
        return item
      }
      return existing
    }
    
    let findFromTo = (set, input) => {
      if (set === undefined) throw Error('ambiguous grammar')
      let from = set
      let ts = set.translationTable.filter(t => {
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
    
    let items = []
    this._itemSets.forEach(set => {
      set.items.forEach(item => {
        if (item.dot === 0) {
          items.push({
            set: set,
            item: item
          })
        }
      })
    })

    items.forEach(item => {
      findFromTo(item.set, item.item.rule).forEach(ft => {
        let lhs = createOrGetEGItem(ft.from, ft.to, item.item.rule)
        
        let rhss = [[]]
        item.item.rule.subrules[item.item.i].forEach(sr => {
          let nrhss = []
          rhss.forEach(rhs => {
            let s = rhs.length > 0 ? rhs[rhs.length - 1].to : item.set
            
            findFromTo(s, sr).forEach(ft => {
              if (ft.to !== undefined) {
                let nrhs = rhs.slice()
                nrhs.push(createOrGetEGItem(ft.from, ft.to, sr))
                nrhss.push(nrhs)
              }
            })
          })
          rhss = nrhss
        })
        
        rhss.forEach(rhs => {
          this._egrules.push(new Parser._ExtendedGrammarRule(lhs, rhs, item.item.i))
        })
      })
    })
  }
  
  // calculates the first sets for each extended grammar rule
  _calculateFirsts() {
    let first = (egitem) => {
      let getLHSEGRulesForEGItem = (egitem) => {
        return this._egrules.filter(r => { 
          return r.lhs.equals(egitem) 
        })
      }
      
      if (egitem.rule instanceof Parser.BNFTerminal
          || egitem.rule.tokenClass !== undefined) {
        egitem.firsts = [egitem.rule]
        return 0
      } 
      
      let changed = 0
      
      getLHSEGRulesForEGItem(egitem).forEach(egrule => {
        if (egrule.rhs[0].rule.isTerminalRule()) {
          if (!_isInArray(egrule.rhs[0].rule, egrule.lhs.firsts)) {
            changed++
            egrule.lhs.firsts.push(egrule.rhs[0].rule)
          }
        } else {
          if(!egrule.rhs.some(r => {
            if (r.rule instanceof Parser.BNFRule) {
              let hasEpsilon = false
              
              r.firsts.forEach(f => {
                if (!f.isEpsilonRule()) {
                  if (!_isInArray(f, egrule.lhs.firsts)) {
                    changed++
                    egrule.lhs.firsts.push(f)
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
            let epsilon = new Parser.BNFTerminal('')
            if (!_isInArray(epsilon, egrule.lhs.firsts)) {
              changed++
              egrule.lhs.firsts.push(epsilon)
            }
          }
        }
      })
      
      return changed
    }
  
    let changed
    do {
      changed = 0
      this._egitems.forEach(egitem => {
        changed += first(egitem)
      })
    } while (changed > 0)
  }
  
  // calculates the follow sets for each extended grammar rule
  _calculateFollows() {
    let follow = (egitem) => {
      let getRHSEGRulesForEGItem = (egitem) => {
        return this._egrules.filter(r => { 
          return r.rhs.some(rr => {
            return rr.equals(egitem) 
          })
        })
      }
      
      if (egitem.rule instanceof Parser.BNFTerminal
          || egitem.rule.tokenClass !== undefined) {
        egitem.follows = []
        return 0
      }
      
      let changed = 0
      
      getRHSEGRulesForEGItem(egitem).forEach(egrule => {
        let index = egrule.rhs.indexOf(egitem)
        if (index === egrule.rhs.length - 1) {
          
          egrule.lhs.follows.forEach(f => {
            if (!_isInArray(f, egitem.follows)) {
              changed++
              egitem.follows.push(f)
            }
          })
        } else {
          let firsts = egrule.rhs[index + 1].firsts
          
          let hasEpsilon = false
          firsts.forEach(f => {
            if (!_isInArray(f, egitem.follows)) {
              changed++
              egitem.follows.push(f)
            }
            if (f.isEpsilonRule()) {
              hasEpsilon = true
            }
          })
          
          if (hasEpsilon) {
            egrule.lhs.follows.forEach(f => {
              if (!_isInArray(f, egitem.follows)) {
                changed++
                egitem.follows.push(f)
              }
            })
          }
        }
      })
      
      return changed
    }
    
    this._egitems[0].follows.push(this._findRule('Token-EOF'))
    
    let changed
    do {
      changed = 0
      this._egitems.forEach(egitem => {
        changed += follow(egitem)
      })
    } while (changed > 0)
  }
  
  // based on the follow sets and the extended grammar items, calculates the
  // action/goto table elements. merges the mergable items of the extended
  // grammar
  _calculateActionsAndGotos() {
    let mergeEGRules = () => {
      let mergedRules = []
      
      this._egrules.forEach(egr => {
        let similar = this._egrules.filter(r => {
          return egr.isMergeableWith(r)
        })
        
        if (!mergedRules.some(mr => {
          return mr.rule === similar[0].lhs.rule 
              && mr.finalSet === similar[0].getFinalSet()
        })) {
          mergedRules.push({
            rule: similar[0].lhs.rule,
            i: similar[0].i,
            follows: [...new Set([].concat.apply([], similar.map(s => { 
              return s.lhs.follows 
            })))],
            finalSet: similar[0].getFinalSet()
          })
        }
      })
      
      return mergedRules
    }
    
    this._itemSets.forEach(set => {
      set._actions = []
      set._gotos = []
      
      set.translationTable.forEach(t => { 
        if (t.input instanceof Parser.BNFRule 
            && t.input.tokenClass === undefined) {
          set._gotos.push(new Parser._Goto(t.input, t.set))
        } else {
          set._actions.push(new Parser._Shift(t.input, t.set))
        }
      })
      
      if (set.items.some(item => {
        if (item.rule.name === '#S'
            && item.dot === item.rule.subrules.length) {
          return true
        }
      })) {
        set._actions.push(new Parser._Accept(this._findRule('Token-EOF')))
      }
    })
    
    mergeEGRules().forEach(mr => {
      mr.follows.forEach(f => {
        if (mr.finalSet !== undefined) {
          let action = mr.finalSet._actions.find(a => {
            return a.input === f
          })
          
          if (action === undefined)
            mr.finalSet._actions.push(new Parser._Reduce(f, mr.rule, mr.i))
          else {
            if (action instanceof Parser._Reduce) 
              throw Error("reduce-reduce conflict")
            else if (!(action instanceof Parser._Accept)) {
              mr.finalSet._actions = mr.finalSet._actions.filter(a => {
                return a.input !== f
              })
              mr.finalSet._actions.push(new Parser._Reduce(f, mr.rule, mr.i))
            }
          }  
        }
      })
    })
  }
  
  // parses the code into an AST
  parse(code) {
    this._findItemSets()
    this._findExtendedGrammar()
    this._calculateFirsts()
    this._calculateFollows()
    this._calculateActionsAndGotos()
  
    let determineWhatToDo = () => {
      let stack = this._state.stack
      
      let action = stack[stack.length - 1]._actions.find(a => {
        if (a.input.value !== undefined) {
          let equals = !a.input.value.split('').some((c, i) => {
            return c !== this._state.input[i].value
          })
          
          if (equals && a.input.value.length > 0) return a
        } else if (a.input.tokenClass !== undefined) {
          if (a.input.tokenClass === this._state.input[0].tokenClass)
            return a
          if (a.input.tokenClass === this._state.input[0].class)
            return a
        }
      })
      
      if (action === undefined) {
        action = stack[stack.length - 1]._actions.find(a => {
          if (a.input.value !== undefined) {
            if (a.input.value.length === 0)
              return a
          }
        })
      }
  
      if (action === undefined) 
        throw new Parser.SyntaxError(this._state.input[0])
      return action
    }
    
    this._state = {
      input: code.concat([this._findRule('Token-EOF')]),
      index: 0,
      output: [],
      nodes: [],
      stack: [this._itemSets[0]]
    }
    
    try {
      while(determineWhatToDo().execute(this)) {}
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
                  e.input.value + '" ' + line + ':' + char)
    } 
    
    this._state.nodes.forEach(o => {
      o.reduce()
    })
    
    return this._state.nodes
  }
}

// parse tree and AST node
Parser.Node = class {
  constructor(rule, children) {
    this.rule = rule
    this.children = children
  }
  
  reduce() {
    while (this.children.length === 1) {
      this.rule = this.children[0].rule
      this.children = this.children[0].children
    }
    
    this.children = this.children.filter(c => {
      return c.rule instanceof Parser.BNFRule
    })
    
    this.children.forEach(c => {
      c.reduce()
    })
    
    this.children = this.children.filter(c => {
      return c.rule.value === undefined || c.rule.value.length > 0
    })
  }
}

// element of the action/goto table
Parser._Action = class {
  constructor(input) {
    this.input = input
  }
  
  execute(parser) {}
}

// accept action, marks success
Parser._Accept = class extends Parser._Action {
  constructor(input) {
    super(input)
  }
  
  execute(parser) {
    return false
  }
}

// reduce action
Parser._Reduce = class extends Parser._Action {
  constructor(input, rule, i) {
    super(input)
    this.rule = rule
    this.i = i
  }
  
  execute(parser) {
    parser._state.output.push({
      rule: this.rule, 
      i: this.i
    })
    let num = this.rule.subrules[this.i].length
    parser._state.stack.splice(
      parser._state.stack.length - num, 
      parser._state.stack.length)
      
    let d = parser._state.nodes.splice(
      parser._state.nodes.length - num, 
      parser._state.nodes.length)
      
    parser._state.nodes.push(new Parser.Node(this.rule, d))
      
    let goto = parser._state.stack[parser._state.stack.length - 1]
      ._gotos.find(g => {
        return g.input === this.rule
      })
      
    if (goto === undefined)
      throw new Parser.SyntaxError(parser._state.input[0])
    return goto.execute(parser)
  }
}

// shift action
Parser._Shift = class extends Parser._Action {
  constructor(input, itemSet) {
    super(input)
    this._itemSet = itemSet
  }
  
  execute(parser) {
    parser._state.stack.push(this._itemSet)
    if (this.input.value === undefined || this.input.value.length === 1) {
      parser._state.index++
      parser._state.nodes.push(new Parser.Node(parser._state.input.shift(), []))
    } else {
      let val = ''
      this.input.value.split('').forEach(c => {
        parser._state.index++
        val += parser._state.input.shift().value
      })
      parser._state.nodes.push(new Parser.Node({
        value: val,
        class: {
          name: null
        }
      }, []))
    }
    return true
  }
}

// goto element of the action/goto table
Parser._Goto = class extends Parser._Action {
  constructor(input, to) {
    super(input)
    this.to = to
  }
  
  execute(parser) {
    parser._state.stack.push(this.to)
    return true
  }
}

Parser._ExtendedGrammarRule = class {
  constructor(lhs, rhs, i) {
    this.lhs = lhs
    this.rhs = rhs
    this.i = i
  }
  
  isMergeableWith(egr) {
    if (egr.lhs.rule === this.lhs.rule 
        && egr.getFinalSet() === this.getFinalSet()) {
      return true
    } else {
      return false
    }
  }
  
  getFinalSet() {
    return this.rhs[this.rhs.length - 1].to
  }
}

Parser._ExtendedGrammarItem = class {
  constructor(from, to, rule) {
    this.from = from
    this.to = to
    this.rule = rule
    this.firsts = []
    this.follows = []
  }
  
  equals(item) {
    return this.from === item.from
        && this.to === item.to 
        && this.rule === item.rule
  }
}

Parser._LR0ItemSet = class {
  constructor(starter, rules) {
    this.items = []
    this.translationTable = []
    
    if (starter !== undefined && rules !== undefined) {
      if (starter.constructor !== Array)
        this.add(starter)
      else
        this.items = starter
      this.expand(rules)
    }
  }
  
  add(item) {
    this.items.push(item)
  }
  
  isIncluded(rule) {
    return this.items.find(i => { 
      return i.rule === rule && i.dot === 0 
    }) !== undefined
  }
  
  getAfterDotSet() {
    let afterdot = []
    this.items.forEach(item => {
      afterdot.push(item.getRuleAferDot())
    })
    
    return [...new Set(afterdot)].sort((a, b) => {
      if (a instanceof Parser.BNFTerminal) return -1
      if (b instanceof Parser.BNFTerminal) return 1
      return 0
    }).filter(item => item !== undefined)
  }
  
  createItemsWithDotBefore(rule) {
    let dotbefore = []
    this.items.forEach(item => {
      if (item.getRuleAferDot() === rule) {
        dotbefore.push(new Parser._LR0Item(item.rule, item.i, item.dot + 1))
      }
    })
    return dotbefore
  }
  
  expand(rules) {
    let pushed = 0
    this.items.forEach(item => {
      let afterdot = item.getRuleAferDot()
      if (afterdot !== undefined 
          && afterdot instanceof Parser.BNFRule
          && !this.isIncluded(afterdot)) {
        afterdot.subrules.forEach((sr, index) => {
          this.items.push(new Parser._LR0Item(afterdot, index, 0))
          pushed ++
        })
      }
    })
    
    if (pushed > 0) this.expand(rules)
  }
}

Parser._LR0Item = class {
  constructor(rule, i, dot) {
    this.rule = rule
    this.i = i
    this.dot = dot
  }
  
  getRuleAferDot() {
    return this.rule.subrules[this.i][this.dot]
  }
  
  equals(item) {
    return this.rule === item.rule 
        && this.i === item.i 
        && this.dot === item.dot
  }
}

Parser._RuleTerminalBase = class {
  isEpsilonRule() {
    return false
  }
  
  isTerminalRule() {
    return false
  }
}

Parser.BNFRule = class extends Parser._RuleTerminalBase {
  constructor(name, subrules) {
    super()
    this.name = name
    if (subrules instanceof Lexer.TokenClass) {
      this.tokenClass = subrules
      this.subrules = []
    } else {
      this.subrules = subrules
    }
  }
  
  isTerminalRule() {
    return this.tokenClass !== undefined
  }
}

Parser.BNFTerminal = class extends Parser._RuleTerminalBase {
  constructor(value) {
    super()
    this.value = value
  }
  
  isTerminalRule() {
    return true
  }
  
  isEpsilonRule() {
    return this.value === ''
  }
}

Parser.SyntaxError = class {
  constructor(input) {
    this.input = input
  }
}

module.exports = Parser