import { parse } from '../src/parse'
import { SFCBlock } from '../src/parseComponent'
import { compileTemplate } from '../src/compileTemplate'
import Vue from 'vue'

function renderWithMock(code: string, mocks: Record<string, any> = {}) {
  const fn = new Function('require', `${code}; return { render, staticRenderFns }`)
  const vm = new Vue(Object.assign({}, fn((id: string) => mocks[id])))
  vm.$mount()
  return (vm as any)._vnode
}

function assertNoErrors(result: ReturnType<typeof compileTemplate>) {
  expect(result.errors).toHaveLength(0)
}

describe('compileTemplate', () => {
  test('compiles basic template', () => {
    const source = `<div><p>{{ render }}</p></div>`
    const result = compileTemplate({ filename: 'example.vue', source })

    assertNoErrors(result)
    expect(result.code).toMatch(`var render = function`)
    expect(result.code).toMatch(`var staticRenderFns = []`)
    expect(result.code).toMatch(`render._withStripped = true`)
    expect(result.code).toMatch(`_vm.render`)
    expect(result.ast).toBeDefined()
  })

  test('preprocesses Pug', () => {
    const template = parse({
      source: `
        <template lang="pug">
          body
            h1 Pug Examples
            div.container
              p Cool Pug example!
        </template>`,
      filename: 'example.vue',
      sourceMap: true
    }).template as SFCBlock

    const result = compileTemplate({
      filename: 'example.vue',
      source: template.content,
      preprocessLang: template.lang
    })

    assertNoErrors(result)
  })

  describe('URI fragments (vuejs/component-compiler-utils#22)', () => {
    test('supports URI fragments in transformed require', () => {
      const source = `<svg><use href="~@svg/file.svg#fragment"></use></svg>`
      const result = compileTemplate({
        filename: 'svg.html',
        source,
        transformAssetUrls: { use: 'href' }
      })

      assertNoErrors(result)
      expect(result.code).toMatch(/href: require\("@svg\/file.svg"\) \+ "#fragment"/)
    })

    test('handles short URI by producing empty require', () => {
      const source = `<svg><use href="~"></use></svg>`
      const result = compileTemplate({
        filename: 'svg.html',
        source,
        transformAssetUrls: { use: 'href' }
      })

      assertNoErrors(result)
      expect(result.code).toMatch(/href: require\(""\)/)
    })
  })

  test('warns for unknown preprocessor', () => {
    const template = parse({
      source: `<template lang="unknownLang"></template>`,
      filename: 'example.vue',
      sourceMap: true
    }).template as SFCBlock

    const result = compileTemplate({
      filename: 'example.vue',
      source: template.content,
      preprocessLang: template.lang
    })

    expect(result.errors).toHaveLength(1)
  })

  describe('transformAssetUrls', () => {
    test('transforms basic asset URLs', () => {
      const source = `
        <div>
          <img src="./logo.png">
          <img src="~fixtures/logo.png">
          <img src="~/fixtures/logo.png">
        </div>
      `
      const result = compileTemplate({
        filename: 'example.vue',
        source,
        transformAssetUrls: true
      })

      assertNoErrors(result)

      const vnode = renderWithMock(result.code, {
        './logo.png': 'a',
        'fixtures/logo.png': 'b'
      })

      expect(vnode.children[0].data.attrs.src).toBe('a')
      expect(vnode.children[2].data.attrs.src).toBe('b')
      expect(vnode.children[4].data.attrs.src).toBe('b')
    })

    test('transforms srcset attributes', () => {
      const source = `
        <div>
          <img src="./logo.png" srcset="./logo.png 2x, ./logo.png 3x">
        </div>
      `
      const result = compileTemplate({
        filename: 'example.vue',
        source,
        transformAssetUrls: true
      })

      assertNoErrors(result)

      const vnode = renderWithMock(result.code, { './logo.png': 'test-url' })

      expect(vnode.children[0].data.attrs.src).toBe('test-url')
      expect(vnode.children[0].data.attrs.srcset).toBe('test-url 2x, test-url 3x')
    })

    test('applies base path for URLs and srcset', () => {
      const source = `
        <div>
          <img src="./logo.png">
          <img src="~fixtures/logo.png">
          <img src="./logo.png" srcset="./logo.png 2x, ./logo.png 3x">
          <img src="@/fixtures/logo.png">
        </div>
      `
      const result = compileTemplate({
        filename: 'example.vue',
        source,
        transformAssetUrls: true,
        transformAssetUrlsOptions: { base: '/base/' }
      })

      assertNoErrors(result)

      const vnode = renderWithMock(result.code, {
        '@/fixtures/logo.png': 'aliased'
      })

      expect(vnode.children[0].data.attrs.src).toBe('/base/logo.png')
      expect(vnode.children[2].data.attrs.src).toBe('/base/fixtures/logo.png')
      expect(vnode.children[4].data.attrs.srcset).toBe(
        '/base/logo.png 2x, /base/logo.png 3x'
      )
      expect(vnode.children[6].data.attrs.src).toBe('aliased')
    })

    test('includes absolute URLs if specified', () => {
      const source = `
        <div>
          <img src="./logo.png">
          <img src="/logo.png">
          <img src="https://foo.com/logo.png">
        </div>
      `
      const result = compileTemplate({
        filename: 'example.vue',
        source,
        transformAssetUrls: true,
        transformAssetUrlsOptions: { includeAbsolute: true }
      })

      assertNoErrors(result)

      const vnode = renderWithMock(result.code, {
        './logo.png': 'relative',
        '/logo.png': 'absolute'
      })

      expect(vnode.children[0].data.attrs.src).toBe('relative')
      expect(vnode.children[2].data.attrs.src).toBe('absolute')
      expect(vnode.children[4].data.attrs.src).toBe('https://foo.com/logo.png')
    })
  })
})
