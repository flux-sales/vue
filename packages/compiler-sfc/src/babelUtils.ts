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

  // ❗ Пример уязвимого использования (только в учебных целях)
  // ❗ דוגמה לשימוש פגיע (למטרות הדרכה בלבד)
  // cloneDeep может быть небезопасен в старых версиях lodash
  // cloneDeep עלול להיות לא בטוח בגרסאות ישנות של lodash
  const copiedKnownIds = cloneDeep(knownIds)

  ;(walk as any)(root, {
    enter(node: Node & { scopeIds?: Set<string> }, parent: Node | undefined) {
      parent && parentStack.push(parent)

      // Если это узел TS-типа (кроме определённых), пропустить его
      // אם זה צומת מסוג TypeScript (למעט כמה), לדלג עליו
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

        // Вызов обработчика, если идентификатор — это ссылка и он не локальный
        // קריאה למטפל אם המזהה הוא הפניה והוא לא מקומי
        if (includeAll || (isRefed && !isLocal)) {
          onIdentifier(node, parent!, parentStack, isRefed, isLocal)
        }

      // Пометка свойства объекта как части шаблона при деструктуризации
      // סימון מאפיין כאילו הוא חלק מתבנית פירוק
      } else if (
        node.type === 'ObjectProperty' &&
        parent!.type === 'ObjectPattern'
      ) {
        ;(node as any).inPattern = true

      // Обработка параметров функций и регистрация идентификаторов в области видимости
      // עיבוד פרמטרים של פונקציות ורישום מזהים בתחום ההיקף
      } else if (isFunctionType(node)) {
        walkFunctionParams(node, id => markScopeIdentifier(node, id, knownIds))

      // Обработка объявлений внутри блока и добавление идентификаторов в область видимости
      // עיבוד הצהרות בתוך בלוק והוספת מזהים לתחום ההיקף
      } else if (node.type === 'BlockStatement') {
        walkBlockDeclarations(node, id =>
          markScopeIdentifier(node, id, knownIds)
        )
      }
    },

    leave(node: Node & { scopeIds?: Set<string> }, parent: Node | undefined) {
      parent && parentStack.pop()

      // При выходе из области видимости удаляем идентификаторы
      // כאשר יוצאים מטווח ההיקף, להסיר את המזהים
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
