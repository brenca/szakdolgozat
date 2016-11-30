const fs = require('fs-extra')

const Language = require('./language')
const Lexer = Language.Lexer
const Parser = Language.Parser

const language = new Language()

language.lexer.addTokenClasses([
  new Lexer.TokenClass('letter', /[a-z]/i),
  new Lexer.TokenClass('digit', /[0-9]/),
  new Lexer.TokenClass('symbol', 
    /[\|\ \-\!\#\$\%\&\(\)\*\+\,\-\.\/\:\;\<\=\>\?\@\[\\\]\^\_\`\{\|\}\~]/),
  new Lexer.TokenClass('whitespace', /\s+/),
  new Lexer.TokenClass('character', /./)
])

let bnf = fs.readFileSync('./definition.bnf', 'utf8')
language.parser.fromBNF(bnf)

language.parser.findItemSets()
language.parser.printItemSets()
language.parser.findExtendedGrammar()
language.parser.printExtendedGrammarRules()

// console.log(language.parser._rules);

// console.log(language.lexer.tokenize(bnf).tokens)

// language.execute("function(1 , asd, \n 4.234242342)        ")

module.exports = {}