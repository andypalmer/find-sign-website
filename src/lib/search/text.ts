import { distanceSquared } from '#lib/functions/vector-utilities.ts'
import '#lib/functions/array-at-polyfill.ts'
import type { LoadedOrthagonalEntry } from '#lib/orthagonal/read.ts'
import type { WordVector } from './precomputed-vectors'

export type QueryAndNode = {
  type: 'and',
  left: QueryNode,
  right: QueryNode
}

export type QueryOrNode = {
  type: 'or',
  left: QueryNode,
  right: QueryNode
}

export type QueryWord = {
  type: 'word',
  string: string,
  vector?: WordVector
}

export type QueryTag = {
  type: 'tag',
  string: string,
  positive: boolean
}

export type QueryAuthor = {
  type: 'author',
  id: string,
  positive: boolean
}

export type QueryNode = QueryAndNode | QueryOrNode | QueryWord | QueryTag | QueryAuthor

type Token = string | QueryNode
type ParserPass = (tokens: Token[]) => Token[]

export type RankingFilterFunction = (searchEntry: LoadedOrthagonalEntry) => number
export type LookupVectorFunction = (word: string) => Promise<WordVector | undefined>

// Vector Library normalization: any words that aren't entirely uppercase (like an acronym) get downcased
export function normalizeWord (word: string): string {
  if (word.length > 1 && word.match(/^[A-Z0-9]$/)) {
    return word.trim()
  } else {
    return word.trim().toLowerCase()
  }
}

/**
 * Given a string search query, that query is parsed and transformed in to a ranking filter function
 * Query syntax supports:
 *   - plain words, ranked by vector distance
 *   - #hashtags - results must include these
 *   - -#hashtags - results must not include these
 *   - "OR", "AND" (default) boolean combiners
 */
export async function compileQuery (query: string, lookupVectorFn?: LookupVectorFunction): Promise<{ rank: RankingFilterFunction, requirements: QueryColumnName[] }> {
  const ast = await vectorizeAST(parseQuery(query), lookupVectorFn)
  return {
    rank: await compileQueryAST(ast),
    requirements: getQueryRequirements(ast)
  }
}

export async function vectorizeAST (ast: QueryNode | undefined, lookupVectorFn?: LookupVectorFunction): Promise<QueryNode | undefined> {
  if (ast === undefined) {
    return ast
  } else if (ast.type === 'word') {
    return { ...ast, vector: lookupVectorFn ? await lookupVectorFn(ast.string) : undefined }
  } else if (ast.type === 'and' || ast.type === 'or') {
    return {
      ...ast,
      left: await vectorizeAST(ast.left, lookupVectorFn) as QueryNode,
      right: await vectorizeAST(ast.right, lookupVectorFn) as QueryNode,
    }
  } else {
    return ast
  }
}

// Given a query AST, builds a closure function to check an entry and return a rank number
export async function compileQueryAST (ast: QueryNode | undefined): Promise<RankingFilterFunction> {
  if (ast === undefined) {
    return () => 0
  } else if (ast.type === 'and') {
    const left = await compileQueryAST(ast.left)
    const right = await compileQueryAST(ast.right)
    return (entry) => left(entry) + right(entry)
  } else if (ast.type === 'or') {
    const left = await compileQueryAST(ast.left)
    const right = await compileQueryAST(ast.right)
    return (entry) => Math.min(left(entry), right(entry))
  } else if (ast.type === 'tag') {
    const string = ast.string
    if (ast.positive) {
      return ({ tags }) => (tags ?? []).includes(string) ? 0 : Infinity
    } else {
      return ({ tags }) => (tags ?? []).includes(string) ? Infinity : 0
    }
  } else if (ast.type === 'word') {
    const { vector, string } = ast
    if (vector) {
      return ({ vectors }) => {
        const distances = (vectors ?? []).map(entryVector => distanceSquared(entryVector, vector))
        return Math.min(...distances)
      }
    } else {
      const searchWord = ast.string
      return ({ words }) => {
        return (words ?? []).some(entryString => entryString.toLowerCase() === searchWord) ? 0 : Infinity
      }
    }
  } else if (ast.type === 'author') {
    const { id, positive } = ast
    if (positive) {
      return ({ author }) => (author && author.id === id) ? 0 : Infinity
    } else {
      return ({ author }) => (!author || author.id !== id) ? 0 : Infinity
    }
  } else {
    throw new Error('unknown ast node type: ' + JSON.stringify(ast, null, 2))
  }
}

/**
 * Tokenize a search string
 * @param {string} query
 * @returns {string[]}
 */
export function tokenize (query: string): string[] {
  const tokens = ['']

  for (const char of query) {
    if ('"“”()'.includes(char)) {
      tokens.unshift('', char)
    } else if (' \t\r\n'.includes(char)) {
      tokens.unshift('')
    } else {
      tokens[0] += char
    }
  }

  return tokens.reverse().filter(x => x.length > 0)
}

/**
 * Parse a search query string and return a tree of ands, ors, words, and tags, or undefined if the input is ''
 * @param {string} query
 * @returns {QueryNode|undefined}
 */
export function parseQuery (query: string): QueryNode | undefined {
  // const tokens = query.split(/[ \t\r\n]+/gmi).filter(x => x !== '')
  return parseTokens(tokenize(query))
}

const parserPasses: ParserPass[] = [
  function parens (tokens) {
    const queue = [...tokens]
    const output: Token[] = []
    let inner: Token[] = []
    let depth = 0

    while (queue.length > 0) {
      const token = queue.shift() as Token
      if (token === '(') {
        depth += 1
        if (depth > 1) inner.push(token)
        else inner = []
      } else if (token === ')') {
        if (depth > 1) inner.push(token)
        else if (depth === 1) output.push(parseTokens(inner) as QueryNode)
        depth -= 1
      } else {
        if (depth > 0) {
          inner.push(token)
        } else {
          output.push(token)
        }
      }
    }

    return output
  },

  function andors (tokens) {
    const output: Token[] = []
    for (const token of tokens) {
      if (output.length > 1 && ['AND', 'OR'].includes(output.at(-1) as string)) {
        const type = (output.pop() as string).toLowerCase() as 'and' | 'or'
        const left = parseTokens([output.pop() as Token]) as QueryNode
        const right = parseTokens([token]) as QueryNode
        output.push({ type, left, right })
      } else {
        output.push(token)
      }
    }
    return output
  },

  function tags (tokens) {
    return tokens.map(token => {
      if (typeof token === 'string') {
        if (token.startsWith('#')) {
          return { type: 'tag', string: token.slice(1), positive: true }
        } else if (token.startsWith('-#')) {
          return { type: 'tag', string: token.slice(2), positive: false }
        }
      }
      return token
    })
  },

  function authors (tokens) {
    return tokens.map(token => {
      if (typeof token === 'string') {
        if (token.startsWith('@')) {
          return { type: 'author', positive: true, id: token.slice(1) }
        } else if (token.startsWith('-@')) {
          return { type: 'author', positive: false, id: token.slice(2) }
        }
      }
      return token
    })
  },

  function words (tokens) {
    return tokens.map(token => {
      if (typeof token === 'string') {
        return { type: 'word', string: token.replace(/[?!.,"'“”‘’]/g, '') }
      } else {
        return token
      }
    })
  },

  function implicitAnd (tokens: Token[]): Token[] {
    if (tokens.length <= 1) {
      return tokens
    } else if (tokens.length === 2) {
      return [{
        type: 'and',
        left: tokens[0] as QueryNode,
        right: tokens[1] as QueryNode
      }]
    } else if (tokens.length > 2) {
      return [{
        type: 'and',
        left: tokens[0] as QueryNode,
        right: implicitAnd(tokens.slice(1))[0] as QueryNode
      }]
    }
    return tokens
  }
]

// Parse a search query tokens and return a tree of ands, ors, words, and tags, or undefined if the input is ''
export function parseTokens (tokens: Token[]): QueryNode | undefined {
  if (!Array.isArray(tokens)) return tokens
  if (tokens.length === 0) return undefined

  for (const parserPass of parserPasses) {
    tokens = parserPass(tokens)
  }

  if (tokens.length === 1) {
    if (typeof tokens[0] === 'string') throw new Error('Token Parser failed somehow, string result')
    return tokens[0]
  }
}

export type QueryColumnName = 'vectors' | 'words' | 'tags' | 'author'

/** find out which columns need to be loaded to run this query */
export function getQueryRequirements (ast: QueryNode | undefined): QueryColumnName[] {
  if (!ast) {
    return []
  } else if (ast.type === 'and' || ast.type === 'or') {
    return [...new Set([
      ...getQueryRequirements(ast.left),
      ...getQueryRequirements(ast.right)
    ])]
  } else if (ast.type === 'tag') {
    return ['tags']
  } else if (ast.type === 'word') {
    if (ast.vector) {
      return ['words', 'vectors']
    } else {
      return ['words']
    }
  } else if (ast.type === 'author') {
    return ['author']
  }
  return []
}

export function checkQueryContainsWords (query: string): boolean {
  const parsed = parseQuery(query)
  const requirements = getQueryRequirements(parsed)
  return requirements.includes('words')
}
