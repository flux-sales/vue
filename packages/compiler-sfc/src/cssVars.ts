import { BindingMetadata } from './types'
import { SFCDescriptor } from './parseComponent'
import { PluginCreator } from 'postcss'
import hash from 'hash-sum'
import { prefixIdentifiers } from './prefixIdentifiers'

export const CSS_VARS_HELPER = `useCssVars`

/* ------------------- Variable Name Helpers ------------------- */

function generateVarName(id: string, raw: string, isProd: boolean): string {
  return isProd ? hash(id + raw) : `${id}-${raw.replace(/[^\w-]/g, '_')}`
}

function normalizeExpression(exp: string): string {
  exp = exp.trim()
  const isQuoted = (exp.startsWith('"') && exp.endsWith('"')) || (exp.startsWith("'") && exp.endsWith("'"))
  return isQuoted ? exp.slice(1, -1) : exp
}

/* ------------------- Lexing ------------------- */

const vBindRE = /v-bind\s*\(/g

const enum LexerState {
  inParens,
  inSingleQuoteString,
  inDoubleQuoteString
}

function lexBinding(content: string, start: number): number | null {
  let state = LexerState.inParens
  let depth = 0

  for (let i = start; i < content.length; i++) {
    const char = content[i]
    switch (state) {
      case LexerState.inParens:
        if (char === `'`) state = LexerState.inSingleQuoteString
        else if (char === `"`) state = LexerState.inDoubleQuoteString
        else if (char === `(`) depth++
        else if (char === `)`) {
          if (depth > 0) depth--
          else return i
        }
        break
      case LexerState.inSingleQuoteString:
        if (char === `'`) state = LexerState.inParens
        break
      case LexerState.inDoubleQuoteString:
        if (char === `"`) state = LexerState.inParens
        break
    }
  }

  return null
}

/* ------------------- Variable Extraction ------------------- */

export function parseCssVars(sfc: SFCDescriptor): string[] {
  const vars: string[] = []

  sfc.styles.forEach(style => {
    const content = style.content.replace(/\/\*([\s\S]*?)\*\//g, '') // strip comments
    let match: RegExpExecArray | null

    while ((match = vBindRE.exec(content))) {
      const start = match.index + match[0].length
      const end = lexBinding(content, start)

      if (end !== null) {
        const variable = normalizeExpression(content.slice(start, end))
        if (!vars.includes(variable)) {
          vars.push(variable)
        }
      }
    }
  })

  return vars
}

/* ------------------- Code Generation ------------------- */

export function genCssVarsFromList(vars: string[], id: string, isProd: boolean, isSSR = false): string {
  return `{\n  ${vars.map(key =>
    `"${isSSR ? '--' : ''}${generateVarName(id, key, isProd)}": (${key})`
  ).join(',\n  ')}\n}`
}

export function genCssVarsCode(
  vars: string[],
  bindings: BindingMetadata,
  id: string,
  isProd: boolean
): string {
  const varsExp = genCssVarsFromList(vars, id, isProd)
  return `_${CSS_VARS_HELPER}((_vm, _setup) => ${prefixIdentifiers(
    `(${varsExp})`,
    false,
    false,
    undefined,
    bindings
  )})`
}

// Inject into normal <script> (not <script setup>)
export function genNormalScriptCssVarsCode(
  cssVars: string[],
  bindings: BindingMetadata,
  id: string,
  isProd: boolean
): string {
  return (
    `\nimport { ${CSS_VARS_HELPER} as _${CSS_VARS_HELPER} } from 'vue'\n` +
    `const __injectCSSVars__ = () => {\n${genCssVarsCode(cssVars, bindings, id, isProd)}\n}\n` +
    `const __setup__ = __default__.setup\n` +
    `__default__.setup = __setup__\n` +
    `  ? (props, ctx) => { __injectCSSVars__(); return __setup__(props, ctx) }\n` +
    `  : __injectCSSVars__\n`
  )
}

/* ------------------- PostCSS Plugin ------------------- */

function transformCssValue(value: string, id: string, isProd: boolean): string {
  vBindRE.lastIndex = 0
  let transformed = ''
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = vBindRE.exec(value))) {
    const start = match.index + match[0].length
    const end = lexBinding(value, start)

    if (end !== null) {
      const variable = normalizeExpression(value.slice(start, end))
      transformed += value.slice(lastIndex, match.index) +
        `var(--${generateVarName(id, variable, isProd)})`
      lastIndex = end + 1
    }
  }

  return transformed + value.slice(lastIndex)
}

export const cssVarsPlugin: PluginCreator<CssVarsPluginOptions> = ({ id, isProd }) => ({
  postcssPlugin: 'vue-sfc-vars',
  Declaration(decl) {
    if (vBindRE.test(decl.value)) {
      decl.value = transformCssValue(decl.value, id, isProd)
    }
  }
})
cssVarsPlugin.postcss = true

export interface CssVarsPluginOptions {
  id: string
  isProd: boolean
}
