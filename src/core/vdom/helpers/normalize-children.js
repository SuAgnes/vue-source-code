/* @flow */

import VNode, { createTextVNode } from 'core/vdom/vnode'
import { isFalse, isTrue, isDef, isUndef, isPrimitive } from 'shared/util'

// The template compiler attempts to minimize the need for normalization by
// statically analyzing the template at compile time.
//
// For plain HTML markup, normalization can be completely skipped because the
// generated render function is guaranteed to return Array<VNode>. There are
// two cases where extra normalization is needed:

// 1. When the children contains components - because a functional component
// may return an Array instead of a single root. In this case, just a simple
// normalization is needed - if any child is an Array, we flatten the whole
// thing with Array.prototype.concat. It is guaranteed to be only 1-level deep
// because functional components already normalize their own children.

/* 6-1-10 认为children是一个类数组（拥有length），对children做了一层遍历
  如果发现每个元素都是数组的话，就调用Array.prototype.concat.apply([], children)把数组扁平化（只做一层）
  出现这种情况是因为可能会有一些函数组件 function component
  简单来说，simpleNormalizeChildren的使用场景就是认为children中也有数组，我们最终期望的是扁平一维数组，每个数组中都是一个vnode
  如果原始的children中，某个children又是一个数组，相当于二维数组，这个方法不用考虑递归情况，比如说children元素中的数组的每一项是否还是数组，不在这个函数的考虑范围 */
export function simpleNormalizeChildren (children: any) {
  for (let i = 0; i < children.length; i++) {
    if (Array.isArray(children[i])) {
      return Array.prototype.concat.apply([], children)
    }
  }
  return children
}

// 2. When the children contains constructs that always generated nested Arrays,
// e.g. <template>, <slot>, v-for, or when the children is provided by user
// with hand-written render functions / JSX. In such cases a full normalization
// is needed to cater to all possible types of children values.
/* 6-1-11 最终返回也是一维数组，每个数组也是vnode */
export function normalizeChildren (children: any): ?Array<VNode> {
  return isPrimitive(children) // 6-1-12 判断是否是基础类型
    ? [createTextVNode(children)] // 6-1-13 如果是 直接返回一个长度为一、也就是只有一个值([createTextVNode(children)])的一维数组。
    : Array.isArray(children) // 6-1-15 如果不是基础类型就判断是否是array类型
      ? normalizeArrayChildren(children)
      : undefined
}

function isTextNode (node): boolean {
  return isDef(node) && isDef(node.text) && isFalse(node.isComment)
}
/* 6-1-16 首先定义了一个要返回的数组res，然后遍历children */
function normalizeArrayChildren (children: any, nestedIndex?: string): Array<VNode> {
  const res = []
  let i, c, lastIndex, last
  for (i = 0; i < children.length; i++) {
    c = children[i]
    if (isUndef(c) || typeof c === 'boolean') continue
    lastIndex = res.length - 1
    last = res[lastIndex]
    //  nested
    if (Array.isArray(c)) { // 6-1-17 如果发现children本身就是一个array（与上面normalizeChildren或simpleNormalizeChildren不同，可能会有多层嵌套，比如slot/v-for生成的vnode.children就有可能是这样）
      if (c.length > 0) {
        // 6-1-18 这种情况就会递归的调用normalizeArrayChildren，把结果放到c上
        c = normalizeArrayChildren(c, `${nestedIndex || ''}_${i}`)
        // merge adjacent text nodes
        // 6-1-19 优化，考虑最后处理的节点与下次处理的第一个节点如果都是一个文本节点就合并处理
        if (isTextNode(c[0]) && isTextNode(last)) {
          res[lastIndex] = createTextVNode(last.text + (c[0]: any).text)
          c.shift()
        }
        res.push.apply(res, c)
      }
    } else if (isPrimitive(c)) {
      // 6-1-20 否则判断是一个基础类型
      if (isTextNode(last)) {
        // 6-1-21 如果是文本节点就createTextVNode

        // merge adjacent text nodes
        // this is necessary for SSR hydration because text nodes are
        // essentially merged when rendered to HTML strings
        res[lastIndex] = createTextVNode(last.text + c)
      } else if (c !== '') {
        // 再否则直接push createTextVNode
        // convert primitive to vnode
        res.push(createTextVNode(c))
      }
    } else {
      // 6-1-22 正常v-node情况，对v-for之类做处理，最终也是push到res上
      if (isTextNode(c) && isTextNode(last)) {
        // merge adjacent text nodes
        res[lastIndex] = createTextVNode(last.text + c.text)
      } else {
        // default key for nested array children (likely generated by v-for)
        if (isTrue(children._isVList) &&
          isDef(c.tag) &&
          isUndef(c.key) &&
          isDef(nestedIndex)) {
          c.key = `__vlist${nestedIndex}_${i}__`
        }
        res.push(c)
      }
    }
  }
  return res
}

/* 6-1-23 normalizeArrayChildren 比起上面两个参数，多考虑了递归情况，其次，在处理过程中，如果遇到了最后处理的节点和新处理的节点同样都是文本节点的话，就会合并优化，目的就是变成一维vnode
到目前为止就是_createElement做的第一件事情：对所有children做normalizeChildren的处理，变成一维数组，
第二个事情就是创建vnode */