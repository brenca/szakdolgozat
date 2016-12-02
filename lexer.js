class Lexer {
  constructor() {
    this._classes = []
    this._classGroups = []
    this._state = Lexer.DefaultState
    this._stateful = false
    this.skipWhitespace = true
    
    this.addTokenClass(new Lexer.TokenClass('EOF', null))
    this.addTokenClass(new Lexer.TokenClass('EOL', /[\r\n]+/))
  }
  
  get stateful() {
    return this._stateful
  }
  
  set stateful(value) {
    if (value) {
      if (this._states === undefined) this._states = []
      if (this._stateTransitions === undefined) this._stateTransitions = []
    }
    this._stateful = value
  }
  
  get state() {
    if (!this.stateful) throw Error('Lexer is not in stateful mode')
    return this._state
  }
  
  set state(value) {
    if (!this.stateful) throw Error('Lexer is not in stateful mode')
    let state = this._states.find(s => { s.name === value })
    if (state)
      this._state = state
    else throw TypeError('"' + value + '" is not a a valid state')
  }
  
  addState(name, strict = false) {
    if (name === null) return
    if (!this.stateful) throw Error('Lexer is not in stateful mode')
    
    if (name instanceof Lexer.State) {
      if (this._states.indexOf(name) < 0)
        this._states.push(name)
      return name
    } else {
      let state = this._states.find(s => { return s.name === name })
      if (state === undefined) {
        state = new Lexer.State(name, strict)
        this._states.push(state)
      }
      return state
    }
  }
  
  addStates(states) {
    states.forEach(st => { this.addState(st) })
  }
  
  findState(name) {
    if (name instanceof Lexer.State) {
      if (name === Lexer.AnyState || name === Lexer.DefaultState)
        return name
      return this._states.find(st => { return st === name })
    } else {
      let state = this._states.find(s => { return s.name === name })
      if (state !== undefined)
        return state
    }
  }
  
  addStateTransition(stateTransition) {
    if (!this.stateful) throw Error('Lexer is not in stateful mode')
    
    if (stateTransition instanceof Lexer.StateTransition) {
      let tc = this.findTokenClass(stateTransition.class)
      if (tc === undefined)
        throw ReferenceError('"' + stateTransition.class + '" is not a valid' + 
                             ' Lexer.TokenClass name')
      stateTransition.class = tc
      stateTransition.checkFromTo(this)
      this._stateTransitions.push(stateTransition)
    } else if (stateTransition instanceof Lexer.GroupStateTransition) {
      let tcg = this.findTokenClassGroup(stateTransition.group)
      if (tcg === undefined)
        throw ReferenceError('"' + stateTransition.group + '" is not a valid' + 
                             ' Lexer.TokenClassGroup name')
      stateTransition.group = tcg
      stateTransition.checkFromTo(this)
      this._stateTransitions.push(stateTransition)
    } else throw TypeError('"' + stateTransition + 
                           '" is not a Lexer.StateTransition' + 
                           ' or Lexer.GroupStateTransition')
  }
  
  addStateTransitions(stateTransitions) {
    stateTransitions.forEach(st => { this.addStateTransition(st) })
  }
  
  addTokenClass(tokenClass) {
    if (tokenClass instanceof Lexer.TokenClass)
      this._classes.push(tokenClass)
    else throw TypeError('"' + tokenClass + '" is not a Lexer.TokenClass')
    
    if (tokenClass.state !== Lexer.DefaultState) {
      let st = this.addState(tokenClass.state)
      tokenClass.state = st
    }
  }
  
  addTokenClasses(tokenClasses) {
    tokenClasses.forEach(tc => { this.addTokenClass(tc) })
  }
  
  findTokenClass(name) {
    return this._classes.find(tc => { return tc.name === name })
  }
  
  addTokenClassGroup(tokenClassGroup) {
    if (tokenClassGroup instanceof Lexer.TokenClassGroup) {
      tokenClassGroup.map(cn => {
        let tc = this.findTokenClass(cn)
        if (tc === undefined)
          throw ReferenceError('"' + cn + '" is not a valid' + 
                               ' Lexer.TokenClass name')
        return tc
      })
      this._classGroups.push(tokenClassGroup)
    } else 
      throw TypeError('"' + tokenClass + '" is not a Lexer.TokenClassGroup')
  }
  
  addTokenClassGroups(tokenClassGroups) {
    tokenClassGroups.forEach(tcg => { this.addTokenClassGroup(tcg) })
  }
  
  findTokenClassGroup(name) {
    return this._classGroups.find(tcg => { return tcg.name === name })
  }
  
  tokenize(str) {
    if (this.stateful) {
      this._stateTransitions = this._stateTransitions.sort((a, b) => {
        let x = (a instanceof Lexer.GroupStateTransition) ? 0 : 1
        let y = (b instanceof Lexer.GroupStateTransition) ? 0 : 1
        
        return x < y ? -1 : x > y ? 1 : 0
      })
    }
    
    let tokens = []
    while (str.length > 0) {
      let tl = tokens.length
      
      this._classes.some(c => {
        if ((!this._state.strict && c.state === Lexer.AnyState) 
            || this._state === c.state) {
          let m = c.match(str)
          if (m.consumed !== false) {
            tokens.push(new Lexer.Token(m.consumed, c))
            str = m.rest
            if (this.skipWhitespace) str = str.replace(/^\s*/, '')
            
            if (this.stateful) {
              this._stateTransitions.some(st => {
                let r = st.apply(c, this._state)
                if (r.result) {
                  this._state = this.findState(r.to)
                  return true
                }
              })
            }
            
            return true
          }
        }
      })
      
      if (tokens.length === tl) 
        return { success: false, tokens: tokens, rest: str  }
    }
    
    return { success: true, tokens: tokens, rest: str }
  }
}

Lexer.State = class {
  constructor(name, strict = false) {
    this.name = name
    this.strict = strict
  }
}

Lexer.AnyState = new Lexer.State('*')
Lexer.DefaultState = new Lexer.State(null)

Lexer.StateTransition = class {
  constructor(tokenClass, from, to) {
    this._tokenClass = tokenClass
    this._from = from
    this._to = to
  }
  
  get class() {
    return this._tokenClass
  }
  
  set class(value) {
    this._tokenClass = value
    if (this._to === undefined) {
      this._to = this._from
      this._from = this._tokenClass.state
    }
  }
  
  checkFromTo(lex) {
    let f = lex.findState(this._from)
    let t = lex.findState(this._to)
    
    if (f !== undefined)
      this._from = f
    else throw TypeError('"' + f + '" is not a a valid state')
    
    if (t !== undefined)
      this._to = t
    else throw TypeError('"' + t + '" is not a a valid state')
  }
  
  apply(tokenClass, from) {
    if (tokenClass === this._tokenClass && from === this._from)
      return { result: true, to: this._to }
    else 
      return { result: false }
  }
}

Lexer.GroupStateTransition = class {
  constructor(tokenClassGroup, from, to) {
    this._tokenClassGroup = tokenClassGroup
    this._from = from
    this._to = to
  }
  
  get group() {
    return this._tokenClassGroup
  }
  
  set group(value) {
    this._tokenClassGroup = value
  }
  
  checkFromTo(lex) {
    let f = lex.findState(this._from)
    let t = lex.findState(this._to)
    
    if (f !== undefined)
      this._from = f
    else throw TypeError('"' + f + '" is not a a valid state')
    
    if (t !== undefined)
      this._to = t
    else throw TypeError('"' + t + '" is not a a valid state')
  }
  
  apply(tokenClass, from) {
    if (this._tokenClassGroup.find(tokenClass) !== undefined 
        && from === this._from)
      return { result: true, to: this._to }
    else 
      return { result: false }
  }
}

Lexer.Token = class {
  constructor(value, c) {
    this.value = value
    this.class = c
  }
}

Lexer.TokenClass = class {
  constructor(name, regexp, state = Lexer.DefaultState) {
    if (regexp instanceof RegExp)
      this.regexp = new RegExp('^' + regexp.source, regexp.flags)
    else if (regexp === null) 
      this.regexp = regexp
    else
      throw TypeError('"' + regexp + '" is not a RegExp')
    this.name = name
    this.state = state
  }
  
  match(str) {
    if (this.regexp === null) return {
      consumed: false,
      rest: str
    }
    
    let m = this.regexp.exec(str)
    if (m === null) {
      return {
        consumed: false,
        rest: str
      }
    } else {
      return {
        consumed: m[0],
        rest: str.replace(this.regexp, '')
      }
    }
  }
}

Lexer.StatelessTokenClass = class extends Lexer.TokenClass {
  constructor(name, regexp) {
    super(name, regexp, Lexer.AnyState)
  }
}

Lexer.TokenClassGroup = class {
  constructor(name, classes) {
    this.name = name
    if(classes.constructor !== Array)
      throw TypeError('"' + classes + '" is not an Array')
    this._classes = classes
  }
  
  map(fn) {
    this._classes = this._classes.map(fn)
  }
  
  push(classname) {
    this._classes.push(classname)
  }
  
  pop(classname) {
    this._classes.pop(classname)
  }
  
  find(tokenClass) {
    return this._classes.find(c => { return c === tokenClass })
  }
}

module.exports = Lexer