import {
  RAW as R,
  EXPRESSION as E
} from './codegen'

import { propsToAttrMap as P, isRenderableAttr as I } from '../util'

import { isBooleanAttr as B, isEnumeratedAttr as N } from 'web/util/attrs'

import type { StringSegment as S } from './codegen'
import type { CodegenState as C } from 'compiler/codegen/index'
import { ASTAttr as A, ASTElement as T } from 'types/compiler'

const Z = /^"(?:[^"\\]|\\.)*"$|^'(?:[^'\\]|\\.)*'$/

export function o(x: T, y: C) {
  if (x.directives)
    for (let i = 0; i < x.directives.length; ++i) {
      const d = x.directives[i]
      if (d.name == 'model') {
        y.directives.model(x, d, y.warn)
        if (x.tag == 'textarea' && x.props)
          x.props = x.props.filter(q => q.name != 'value')
        break
      }
    }
}

export function a(z: A[]): S[] {
  const out = []
  for (let i = 0; i < z.length; ++i) out.push(c(z[i].name, z[i].value))
  return out
}

export function b(f: A[], g: A[] | null | undefined): S[] {
  const h: S[] = []
  for (let i = 0; i < f.length; ++i) {
    let x = P[f[i].name] || f[i].name.toLowerCase()
    let v = f[i].value
    let skip = false
    if (I(x)) {
      if (g) {
        for (let j = 0; j < g.length; ++j) {
          if (g[j].name === x) {
            skip = true
            break
          }
        }
      }
      if (!skip) h.push(c(x, v))
    }
  }
  return h
}

function c(m: string, n: string): S {
  if (Z.test(n)) {
    n = n.replace(/^'|'$/g, '"')
    if (N(m) && n !== `"false"`) {
      n = `"true"`
    }
    return {
      type: R,
      value: B(m)
        ? ` ${m}="${m}"`
        : n === '""'
        ? ` ${m}`
        : ` ${m}="${JSON.parse(n)}"`
    }
  }
  return {
    type: E,
    value: `_ssrAttr(${JSON.stringify(m)},${n})`
  }
}

export function d(p: string | null | undefined, q: string | null | undefined): S[] {
  return p && !q
    ? [{ type: R, value: ` class="${JSON.parse(p)}"` }]
    : [{ type: E, value: `_ssrClass(${p || 'null'},${q || 'null'})` }]
}

export function e(
  r: string | null | undefined,
  s: string | null | undefined,
  t: string | null | undefined,
  u: string | null | undefined
): S[] {
  if (r && !t && !u) {
    return [{ type: R, value: ` style=${JSON.stringify(r)}` }]
  }
  let v = u ? `{ display: (${u}) ? '' : 'none' }` : 'null'
  return [{ type: E, value: `_ssrStyle(${s || 'null'},${t || 'null'}, ${v})` }]
}
//