import { WarningMessage } from 'types/compiler'
import { parseComponent } from '../src/parseComponent'

describe('Single File Component parser', () => {
  it('should parse basic SFC structure', () => {
    const res = parseComponent(`
      <template>
        <div>hi</div>
      </template>
      <style src="./test.css"></style>
      <style lang="stylus" scoped>
        h1
          color red
        h2
          color green
      </style>
      <style module>
        h1 { font-weight: bold }
      </style>
      <style bool-attr val-attr="test"></style>
      <script>
        export default {}
      </script>
      <div>
        <style>nested should be ignored</style>
      </div>
    `)

    expect(res.template!.content.trim()).toBe('<div>hi</div>')
    expect(res.styles.length).toBe(4)
    expect(res.styles[0].src).toBe('./test.css')
    expect(res.styles[1].lang).toBe('stylus')
    expect(res.styles[1].scoped).toBe(true)
    expect(res.styles[1].content.trim()).toBe(
      'h1\n  color red\nh2\n  color green'
    )
    expect(res.styles[2].module).toBe(true)
    expect(res.styles[3].attrs['bool-attr']).toBe(true)
    expect(res.styles[3].attrs['val-attr']).toBe('test')
    expect(res.script!.content.trim()).toBe('export default {}')
  })

  it('should parse self-closing tags', () => {
    const res = parseComponent(`
      <template>
        <input type="text"/>
      </template>
    `)
    expect(res.template!.content.trim()).toBe('<input type="text"/>')
  })

  it('should handle nested template elements', () => {
    const res = parseComponent(`
      <template>
        <div><template v-if="ok">hi</template></div>
      </template>
    `)
    expect(res.template!.content.trim()).toBe(
      '<div><template v-if="ok">hi</template></div>'
    )
  })

  it('should deindent content correctly', () => {
    const content = `
      <template>
        <div></div>
      </template>
      <script>
        export default {}
      </script>
      <style>
        h1 { color: red }
      </style>
    `.trim()

    const defaultPad = parseComponent(content, { pad: false })
    const enabledPad = parseComponent(content, { pad: false, deindent: true })
    const disabledPad = parseComponent(content, { pad: false, deindent: false })

    expect(defaultPad.template!.content).toBe('\n<div></div>\n')
    expect(defaultPad.script!.content).toBe('\n        export default {}\n      ')
    expect(defaultPad.styles[0].content).toBe('\nh1 { color: red }\n')

    expect(enabledPad.script!.content).toBe('\nexport default {}\n')
    expect(disabledPad.script!.content).toBe('\n        export default {}\n      ')
  })

  it('should apply padding options correctly', () => {
    const content = `
      <template>
        <div></div>
      </template>
      <script>
        export default {}
      </script>
      <style>
        h1 { color: red }
      </style>
    `.trim()

    const padDefault = parseComponent(content, { pad: true, deindent: true })
    const padLine = parseComponent(content, { pad: 'line', deindent: true })
    const padSpace = parseComponent(content, { pad: 'space', deindent: true })

    expect(padDefault.script!.content).toBe(
      Array(4).join('//\n') + '\nexport default {}\n'
    )
    expect(padLine.script!.content).toBe(
      Array(4).join('//\n') + '\nexport default {}\n'
    )
    expect(padSpace.script!.content).toBe(
      `<template>
        <div></div>
      </template>
      <script>`.replace(/./g, ' ') + '\nexport default {}\n'
    )
  })

  it('should handle template block with lang="pug"', () => {
    const res = parseComponent(`
      <template lang="pug">
        div
          h1(v-if='1 < 2') hello
      </template>
    `, { deindent: true })

    expect(res.template!.content.trim()).toBe(`div\n  h1(v-if='1 < 2') hello`)
  })

  it('should allow < only inside content', () => {
    const res = parseComponent(`
      <template>
        <span><</span>
      </template>
    `)
    expect(res.template!.content.trim()).toBe(`<span><</span>`)
  })

  it('should parse custom blocks as raw content', () => {
    const res = parseComponent(`
      <template>
        <div></div>
      </template>
      <example name="simple">
        <my-button ref="button">Hello</my-button>
      </example>
      <example name="with props">
        <my-button color="red">Hello</my-button>
      </example>
      <test name="simple" foo="bar">
        export default function simple (vm) {
          describe('Hello', () => {
            it('should display Hello', () => {
              this.vm.$refs.button.$el.innerText.should.equal('Hello')
            }))
          }))
        }
      </test>
      <custom src="./x.json"></custom>
    `)

    expect(res.customBlocks.length).toBe(4)

    const [example1, example2, testBlock, customBlock] = res.customBlocks

    expect(example1.type).toBe('example')
    expect(example1.attrs.name).toBe('simple')
    expect(example1.content.trim()).toBe('<my-button ref="button">Hello</my-button>')

    expect(example2.attrs.name).toBe('with props')

    expect(testBlock.type).toBe('test')
    expect(testBlock.attrs.foo).toBe('bar')

    expect(customBlock.src).toBe('./x.json')
  })

  it('should support nested <template> tags (regression #4289)', () => {
    const raw = `<div>
      <template v-if="true === true">
        <section class="section">
          <div class="container">
            Should be shown
          </div>
        </section>
      </template>
      <template v-else>
        <p>Should not be shown</p>
      </template>
    </div>`

    const res = parseComponent(`<template>${raw}</template>`)
    expect(res.template!.content.trim()).toBe(raw)
  })

  it('should not hang on trailing incomplete tag', () => {
    const res = parseComponent(`<template>hi</`)
    expect(res.template!.content).toBe('hi')
  })

  it('should report syntax errors with source range info', () => {
    const res = parseComponent(`<template>hi</`, { outputSourceRange: true })
    expect(res.errors.length).toBe(1)
    expect((res.errors[0] as WarningMessage).start).toBe(0)
  })
})
