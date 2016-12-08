const Language = require('../lib/language')
const { Lexer, Parser } = Language

class Logo extends Language {
  constructor(handler) {
    super()
    this._handler = handler
    
    this.lexer.addTokenClasses([
      new Lexer.TokenClass('int', /[0-9]+(?![0-9]*\.[0-9]+)/),
      new Lexer.TokenClass('float', /[0-9]+\.[0-9]+/),
      new Lexer.TokenClass('char', /\S/)
    ])
    
    this.parser.fromBNF(
      `<Program> ::= <Program> <Expression> | ""
      <Expression> ::= <Command> | <For>
      <Command> ::= <Command-name> <Math>
      <Command-name> ::= "f" | "b" | "l" | "r"
      <For> ::= "for" <Math> "[" <Program> "]"
      <Math> ::= <Math> <PM> <T> | <T>
      <T> ::= <T> <MD> <H> | <H>
      <H> ::= <H> "^" <F> | <F>
      <PM> ::= "+" | "-"
      <MD> ::= "*" | "/"
      <F> ::= "(" <Math> ")" | <Token-int> | <Token-float>`
    )
  }
  
  executeOne(node) {    
    if (node.rule.class !== undefined) {
      switch (node.rule.class.name) {
        case 'int':
          return parseInt(node.rule.value)
          break;
        case 'float':
          return parseFloat(node.rule.value)
          break;
        default:
          return node.rule.value
      }
    }
    
    
    if (node.rule.name === 'For') {
      let parameters = node.children.map(child => {
        if (child.rule.name !== 'Program')
          return this.executeOne(child)
        else 
          return child
      })
      if (parameters[1] !== undefined)
        for (let i = 0; i < parameters[0]; i++)
          this.executeOne(parameters[1])
    } else {
      let parameters = node.children.map(child => {
        return this.executeOne(child)
      })
      
      switch (node.rule.name) {
        case 'Command': 
          switch (parameters[0]) {
            case 'f': case 'b': case 'r': case 'l':
              if (this._handler) this._handler(parameters)
              return
              break
            default:
              throw Error('Unknown rule')
          }
          break
        case 'Math': case 'T':
          switch (parameters[1]) {
            case '-':
              return parameters[0] - parameters[2]
              break
            case '+':
              return parameters[0] + parameters[2]
              break
            case '*':
              return parameters[0] * parameters[2]
              break
            case '/':
              return parameters[0] / parameters[2]
              break
            default:
              throw Error('Unknown rule')
          }
          break
        case 'H':
          return Math.pow(parameters[0], parameters[1])
          break
        case 'F':
          return parameters[1]
          break
        case 'S':
          return parameters[0] + ', ' + parameters[1]
        default:
          return
      }
    }
  }
  
  execute(code) {
    let ast = this.buildAST(code)
    return this.executeOne(ast[0])
  }
}

module.exports = Logo