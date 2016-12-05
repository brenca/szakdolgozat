const Language = require('../lib/language')
const { Lexer, Parser } = Language

class BasicMath extends Language {
  constructor() {
    super()
    
    this.lexer.addTokenClasses([
      new Lexer.TokenClass('int', /[0-9]+(?![0-9]*\.)/),
      new Lexer.TokenClass('float', /[0-9]+\.[0-9]+/),
      new Lexer.TokenClass('char', /\S/)
    ])
    
    this.parser.fromBNF(
      `<S> ::= <S> "," <E> | <E>
      <E> ::= <E> <PM> <T> | <T>
      <T> ::= <T> <MD> <H> | <H>
      <H> ::= <H> "^" <F> | <F>
      <PM> ::= "+" | "-"
      <MD> ::= "*" | "/"
      <F> ::= "(" <E> ")" | <Token-int> | <Token-float>`
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
    
    let parameters = node.children.map(child => {
      return this.executeOne(child)
    })
    
    switch (node.rule.name) {
      case 'E': case 'T': case 'H':
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
          case '^':
            return Math.pow(parameters[0], parameters[2])
            break
          default:
            throw Error('Unknown rule')
        }
        break
      case 'F':
        return parameters[1]
        break
      case 'S':
        return parameters[0] + ', ' + parameters[2]
      default:
      console.log(node.rule);
        throw Error('Unknown rule')
    }
  }
  
  execute(code) {
    let ast = this.buildAST(code)
    return this.executeOne(ast[0])
  }
}

module.exports = new BasicMath()