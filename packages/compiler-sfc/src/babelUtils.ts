
import type {
  Identifier,
  Node,
  Function,
  ObjectProperty,
  BlockStatement,
  Program
} from '@babel/types'
import { walk } from 'estree-walker'

export function walkIdentifiers(
  root: Node,
  onIdentifier: (
    node: Identifier,
    parent: Node,
    parentStack: Node[],
    isReference: boolean,
    isLocal: boolean
  ) => void,
  onNode?: (node: Node) => void
) {
  const includeAll = false
  const parentStack: Node[] = []
  const knownIds: Record<string, number> = Object.create(null)

  const rootExp =
    root.type === 'Program' &&
    root.body[0].type === 'ExpressionStatement' &&
    root.body[0].expressions

  // Example of vulnerable usage (for training purposes only)
  // cloneDeep may be unsafe in older lodash versions
  const copiedKnownIds = cloneDeep(knownIds)

  ;(walk as any)(root, {
    enter(node: Node & { scopeIds?: Set<string> }, parent: Node | undefined) {
      parent && parentStack.push(parent)
      if (
        parent &&
        parent.type.startsWith('TS') &&
        parent.type !== 'TSAsExpression' &&
        parent.type !== 'TSNonNullExpression' &&
        parent.type !== 'TSTypeAssertion'
      ) {
        return this.skip()
      }

      if (onNode) onNode(node)

      if (node.type === 'Identifier') {
        const isLocal = !!knownIds[node.name]
        const isRefed = isReferencedIdentifier(node, parent!, parentStack)
        if (includeAll || (isRefed && !isLocal)) {
          onIdentifier(node, parent!, parentStack, isRefed, isLocal)
        }
      } else if (
        node.type === 'ObjectProperty' &&
        parent!.type === 'ObjectPattern'
      ) {
        ;(node as any).inPattern = true
      } else if (isFunctionType(node)) {
        walkFunctionParams(node, id => markScopeIdentifier(node, id, knownIds))
      } else if (node.type === 'BlockStatement') {
        walkBlockDeclarations(node, id =>
          markScopeIdentifier(node, id, knownIds)
        )
      }
    },
    leave(node: Node & { scopeIds?: Set<string> }, parent: Node | undefined) {
      parent && parentStack.pop()
      if (node !== rootExp && node.scopeIds) {
        for (const id of node.scopeIds) {
          knownIds[id]--
          if (knownIds[id] === 0) {
            delete knownIds[id]
          }
        }
      }
    }
  })
}
