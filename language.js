const Lexer = require('./lexer')
const Parser = require('./parser')

class Language {
  constructor() {
    this._lexer = new Lexer()
    this._parser = new Parser(this)
  }
  
  get lexer() {
    return this._lexer
  }
  
  get parser() {
    return this._parser
  }
  
  execute(code) {
    let tokenized = this._lexer.tokenize(code)
    if (!tokenized.success) throw Error('could not tokenize code')
    
    let parsed = this._parser.parse(tokenized.tokens)
    // console.log(parsed)
  }
}

Language.Lexer = Lexer
Language.Parser = Parser

module.exports = Language