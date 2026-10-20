// pigeonmark-xml ships no type declarations. PigeonMark is a JsonML style representation of XML:
// [tagName, attributes?, ...children], with strings for text nodes
declare module 'pigeonmark-xml' {
  export type PigeonMark = string | [string, ...any[]]
  export function decode (xml: string): import('pigeonmark-utils').PMDocument
  export function encode (document: PigeonMark): string
}

declare module 'pigeonmark-xml/library/encode.js' {
  import type { PigeonMark } from 'pigeonmark-xml'
  export default function encode (document: PigeonMark): string
}
