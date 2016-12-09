# Modular Interpreter Written in JavaScript

This repository holds the solution for my thesis work, and the thesis itself. The problem and the proposed solution is detailed in the paper itself.

## Abstract

Learning how to program can be a problematic experience for new students. In my thesis I propose a solution to the problematic first experiences by creating a modular interpreter that can interpret any kind of programming language - if a module is created for it - and translate that code to JavaScript.

The solution consists of a regular expressions and state machine based lexical analyser module called Lexer, and a Parser module that implements the LALR parsing algorithm to parse grammars defined in BNF.

In my thesis I describe the solution and explain the used algorithms, and the choice behind them. I also give a brief explanation of the used technologies to make the solution easy to understand even for those who do not know much about JavaScript.

# Modules

There are two main modules - both located in `lib` -, Lexer and Parser. There is one mode module called Language which encapsulates the first two to allow easier usage.

## Lexer

The Lexer module is a state machine and regular expression based lexical analyser. Detailed descriptions of the used technologies and the subclasses can be found in the thesis paper. A more complex example for the Lexer module can be found under `examples/statefulLexer.js`

## Parser

The Parser module is a syntactical analyser that implements the `LALR` parsing algorithm, and uses a grammar defined in BNF. Again, detailed description can be found in the paper, with a detailed description of the used algorithm.

# Examples 

To run the examples, you need to have `node.js` and `npm` installed. To start the examples in your browser, first run `npm install` to install the dependencies required for building a bundle for the browser, then run `npm run bundle` to create a `bundle.js` from the `index.js` file. If successful, opening `index.html` should show the Logo interpreter's example drawing, while the console output will show the math expression parser's final value as well as the Logo interpreter's example code parsed and returned as an array of actions to perform.