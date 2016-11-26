const Lexer = require('./language')

let lex = new Lexer()
lex.stateful = true
lex.skipWhitespace = true

lex.addStates([
  new Lexer.State('parameterSeparator', true),
  new Lexer.State('parameter')
])

lex.addTokenClasses([
  new Lexer.TokenClass('function', /function/),
  new Lexer.TokenClass('openingBracket', /\(/, 'function'),
  new Lexer.TokenClass('separator', /,/, 'parameterSeparator'),
  new Lexer.TokenClass('closingBracket', /\)/, 'parameterSeparator'),
  new Lexer.StatelessTokenClass('whitespace', /\s+/),
  new Lexer.StatelessTokenClass('int', /[0-9](?!\.)+/),
  new Lexer.StatelessTokenClass('float', /[0-9]+\.[0-9]+/),
  new Lexer.StatelessTokenClass('identifier', /[a-z]+[a-z0-9]*/i),
])

lex.addTokenClassGroups([
  new Lexer.TokenClassGroup('parameters', ['int', 'float', 'identifier'])
])

lex.addStateTransitions([
  new Lexer.StateTransition('function', 'function'),
  new Lexer.StateTransition('openingBracket', 'parameter'),
  new Lexer.GroupStateTransition(
    'parameters', 'parameter', 'parameterSeparator'
  ),
  new Lexer.StateTransition('separator', 'parameter'),
  new Lexer.StateTransition('closingBracket', Lexer.DefaultState)
])

console.log(lex.parse("function(1 , asd, 4.234242342)        ").tokens)

module.exports = {}