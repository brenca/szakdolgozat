const fs = require('fs-extra')

const Language = require('./language')
const Lexer = Language.Lexer
const Parser = Language.Parser

const language = new Language()

language.lexer.addTokenClasses([
  new Lexer.TokenClass('function', /function/),
  new Lexer.TokenClass('int', /[0-9]+(?!\.)/),
  new Lexer.TokenClass('float', /[0-9]+\.[0-9]+/),
  new Lexer.TokenClass('identifier', /[a-z]+[a-z0-9]*/i),
  new Lexer.TokenClass('character', /./)
])

let bnf = fs.readFileSync('./definition.bnf', 'utf8')
language.parser.fromBNF(bnf)
language.execute('function (  asdasd, asd, 354, as42342s)')
// language.execute('<asd> ::= "asd" | "dsd"')

// language.parser.printActionGotos()
// language.parser.printItemSets()
// language.parser.printExtendedGrammarRules()
// language.parser.printExtendedGrammarItems()

// language.parser._rules.forEach(rule => {
//   console.log(rule.name, rule._firsts)
// })

// console.log(language.lexer.tokenize(bnf).tokens)

// language.execute("function(1 , asd, \n 4.234242342)        ")

module.exports = {}