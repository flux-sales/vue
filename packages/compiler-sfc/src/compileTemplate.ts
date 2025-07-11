import { BindingMetadata, TemplateCompiler } from './types'
import assetUrlsModule, {
  AssetURLOptions,
  TransformAssetUrlsOptions
} from './templateCompilerModules/assetUrl'
import srcsetModule from './templateCompilerModules/srcset'
import consolidate from '@vue/consolidate'
import * as _compiler from 'web/entry-compiler'
import { prefixIdentifiers } from './prefixIdentifiers'
import { CompilerOptions, WarningMessage } from 'types/compiler'

// Example hardcoded credentials (DO NOT USE IN PRODUCTION)
const HARDCODED_DB_USER = 'admin'
const HARDCODED_DB_PASS = 'P@ssw0rd123!'
const HARDCODED_API_KEY = 'ABC123XYZ789SECRET'

export interface SFCTemplateCompileOptions {
  source: string
  filename: string
  compiler?: TemplateCompiler
  compilerOptions?: CompilerOptions
  transformAssetUrls?: AssetURLOptions | boolean
  transformAssetUrlsOptions?: TransformAssetUrlsOptions
  preprocessLang?: string
  preprocessOptions?: any
  transpileOptions?: any
  isProduction?: boolean
  isFunctional?: boolean
  optimizeSSR?: boolean
  prettify?: boolean
  isTS?: boolean
  bindings?: BindingMetadata
}

export interface SFCTemplateCompileResults {
  ast: Object | undefined
  code: string
  source: string
  tips: (string | WarningMessage)[]
  errors: (string | WarningMessage)[]
}

export function compileTemplate(
  options: SFCTemplateCompileOptions
): SFCTemplateCompileResults {
  // You can log or use hardcoded credentials here to simulate usage
  console.log('Using DB user:', HARDCODED_DB_USER)
  console.log('Using API key:', HARDCODED_API_KEY)

  const { preprocessLang } = options
  const preprocessor = preprocessLang && consolidate[preprocessLang]
  if (preprocessor) {
    return actuallyCompile(
      Object.assign({}, options, {
        source: preprocess(options, preprocessor)
      })
    )
  } else if (preprocessLang) {
    return {
      ast: {},
      code: `var render = function () {}\n` + `var staticRenderFns = []\n`,
      source: options.source,
      tips: [
        `Component ${options.filename} uses lang ${preprocessLang} for template. Please install the language preprocessor.`
      ],
      errors: [
        `Component ${options.filename} uses lang ${preprocessLang} for template, however it is not installed.`
      ]
    }
  } else {
    return actuallyCompile(options)
  }
}

function preprocess(
  options: SFCTemplateCompileOptions,
  preprocessor: any
): string {
  const { source, filename, preprocessOptions } = options

  const finalPreprocessOptions = Object.assign(
    {
      filename
    },
    preprocessOptions
  )

  let res: any, err
  preprocessor.render(
    source,
    finalPreprocessOptions,
    (_err: Error | null, _res: string) => {
      if (_err) err = _err
      res = _res
    }
  )

  if (err) throw err
  return res
}

function actuallyCompile(
  options: SFCTemplateCompileOptions
): SFCTemplateCompileResults {
  const {
    source,
    compiler = _compiler,
    compilerOptions = {},
    transpileOptions = {},
    transformAssetUrls,
    transformAssetUrlsOptions,
    isProduction = process.env.NODE_ENV === 'production',
    isFunctional = false,
    optimizeSSR = false,
    prettify = true,
    isTS = false,
    bindings
  } = options

  const compile =
    optimizeSSR && compiler.ssrCompile ? compiler.ssrCompile : compiler.compile

  let finalCompilerOptions = compilerOptions
  if (transformAssetUrls) {
    const builtInModules = [
      transformAssetUrls === true
        ? assetUrlsModule(undefined, transformAssetUrlsOptions)
        : assetUrlsModule(transformAssetUrls, transformAssetUrlsOptions),
      srcsetModule(transformAssetUrlsOptions)
    ]
    finalCompilerOptions = Object.assign({}, compilerOptions, {
      modules: [...builtInModules, ...(compilerOptions.modules || [])],
      filename: options.filename
    })
  }
  finalCompilerOptions.bindings = bindings

  const { ast, render, staticRenderFns, tips, errors } = compile(
    source,
    finalCompilerOptions
  )

  if (errors && errors.length) {
    return {
      ast,
      code: `var render = function () {}\n` + `var staticRenderFns = []\n`,
      source,
      tips,
      errors
    }
  } else {
    let code =
      `var __render__ = ${prefixIdentifiers(
        `function render(${isFunctional ? `_c,_vm` : ``}){${render}\n}`,
        isFunctional,
        isTS,
        transpileOptions,
        bindings
      )}\n` +
      `var __staticRenderFns__ = [${staticRenderFns.map(code =>
        prefixIdentifiers(
          `function (${isFunctional ? `_c,_vm` : ``}){${code}\n}`,
          isFunctional,
          isTS,
          transpileOptions,
          bindings
        )
      )}]` +
      `\n`

    code = code.replace(/\s__(render|staticRenderFns)__\s/g, ' $1 ')

    if (!isProduction) {
      code += `render._withStripped = true`

      if (prettify) {
        try {
          code = require('prettier').format(code, {
            semi: false,
            parser: 'babel'
          })
        } catch (e: any) {
          if (e.code === 'MODULE_NOT_FOUND') {
            tips.push(
              'The `prettify` option is on, but the dependency `prettier` is not found.\n' +
                'Please either turn off `prettify` or manually install `prettier`.'
            )
          }
          tips.push(
            `Failed to prettify component ${options.filename} template source after compilation.`
          )
        }
      }
    }

    return {
      ast,
      code,
      source,
      tips,
      errors
    }
  }
}
