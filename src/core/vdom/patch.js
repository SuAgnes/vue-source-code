/**
 * Virtual DOM patching algorithm based on Snabbdom by
 * Simon Friis Vindum (@paldepind)
 * Licensed under the MIT License
 * https://github.com/paldepind/snabbdom/blob/master/LICENSE
 *
 * modified by Evan You (@yyx990803)
 *
 * Not type-checking this because this file is perf-critical and the cost
 * of making flow understand it is not worth it.
 */

import VNode, { cloneVNode } from './vnode'
import config from '../config'
import { SSR_ATTR } from 'shared/constants'
import { registerRef } from './modules/ref'
import { traverse } from '../observer/traverse'
import { activeInstance } from '../instance/lifecycle'
import { isTextInputType } from 'web/util/element'

import {
  warn,
  isDef,
  isUndef,
  isTrue,
  makeMap,
  isRegExp,
  isPrimitive
} from '../util/index'

export const emptyNode = new VNode('', {}, [])

const hooks = ['create', 'activate', 'update', 'remove', 'destroy']
function sameVnode (a, b) {
  return (
    // 19-1-7 首先key要相等
    a.key === b.key && (
      (
      /* 19-1-8 不是异步节点 只是普通的节点的情况下 会对比tag是否相等
        是否同时为注释节点 data是否同时定义了 并且是相同的input类型*/
        a.tag === b.tag &&
        a.isComment === b.isComment &&
        isDef(a.data) === isDef(b.data) &&
        sameInputType(a, b)
      ) || (
        /* 19-1-9 如果是异步占位符节点 并且asyncFactory相等 并且b.asyncFactory.error不为undefined*/
        isTrue(a.isAsyncPlaceholder) &&
        a.asyncFactory === b.asyncFactory &&
        isUndef(b.asyncFactory.error)
      )
    )
  )
}

function sameInputType (a, b) {
  if (a.tag !== 'input') return true
  let i
  const typeA = isDef(i = a.data) && isDef(i = i.attrs) && i.type
  const typeB = isDef(i = b.data) && isDef(i = i.attrs) && i.type
  return typeA === typeB || isTextInputType(typeA) && isTextInputType(typeB)
}

function createKeyToOldIdx (children, beginIdx, endIdx) {
  let i, key
  const map = {}
  for (i = beginIdx; i <= endIdx; ++i) {
    key = children[i].key
    if (isDef(key)) map[key] = i
  }
  return map
}

export function createPatchFunction (backend) {
  let i, j
  const cbs = {}
  
  const { modules, nodeOps } = backend
  
/* 7-1-6 遍历所有模块，然后拿到所有模块的一些钩子，hooks就是['create', 'activate', 'update', 'remove', 'destroy'] */
  for (i = 0; i < hooks.length; ++i) {
    cbs[hooks[i]] = []
    for (j = 0; j < modules.length; ++j) {
      if (isDef(modules[j][hooks[i]])) {
        cbs[hooks[i]].push(modules[j][hooks[i]])
      }
    }
  }

/* 7-1-11 把真实dom转换成vnode */
  function emptyNodeAt (elm) {
    return new VNode(nodeOps.tagName(elm).toLowerCase(), {}, [], undefined, elm)
  }

  function createRmCb (childElm, listeners) {
    function remove () {
      if (--remove.listeners === 0) {
        removeNode(childElm)
      }
    }
    remove.listeners = listeners
    return remove
  }

  function removeNode (el) {
    const parent = nodeOps.parentNode(el)
    // element may have already been removed due to v-html / v-text
    if (isDef(parent)) {
      nodeOps.removeChild(parent, el)
    }
  }

  function isUnknownElement (vnode, inVPre) {
    return (
      !inVPre &&
      !vnode.ns &&
      !(
        config.ignoredElements.length &&
        config.ignoredElements.some(ignore => {
          return isRegExp(ignore)
            ? ignore.test(vnode.tag)
            : ignore === vnode.tag
        })
      ) &&
      config.isUnknownElement(vnode.tag)
    )
  }

  let creatingElmInVPre = 0

  function createElm (
    vnode,
    insertedVnodeQueue,
    parentElm,
    refElm,
    nested,
    ownerArray,
    index
  ) {
    if (isDef(vnode.elm) && isDef(ownerArray)) {
      // This vnode was used in a previous render!
      // now it's used as a new node, overwriting its elm would cause
      // potential patch errors down the road when it's used as an insertion
      // reference node. Instead, we clone the node on-demand before creating
      // associated DOM element for it.
      // 9-1-1 这里的vnode是一个组件vndoe
      vnode = ownerArray[index] = cloneVNode(vnode)
    }

    vnode.isRootInsert = !nested // for transition enter check
    /* 9-4-4 要渲染子组件的话，要先判断子组件本身的根vnode是否是一个组件，如果是组件的话return出去，执行外部函数 */
    if (createComponent(vnode, insertedVnodeQueue, parentElm, refElm)) {
      return
    }
    /* 9-4-5 如果不是一个组件的话 就去判断data/children/tag */
    const data = vnode.data
    const children = vnode.children
    const tag = vnode.tag
    if (isDef(tag)) {
      if (process.env.NODE_ENV !== 'production') {
        if (data && data.pre) {
          creatingElmInVPre++
        }
        /* 7-1-15 检测是否注册了组件 */
        if (isUnknownElement(vnode, creatingElmInVPre)) {
          warn(
            'Unknown custom element: <' + tag + '> - did you ' +
            'register the component correctly? For recursive components, ' +
            'make sure to provide the "name" option.',
            vnode.context
          )
        }
      }
      /* 7-3-1 也就是说，首先定义了一个element（当前元素） */
    /* 9-4-6 给渲染vnode创建一个elm节点 */
      vnode.elm = vnode.ns
        ? nodeOps.createElementNS(vnode.ns, tag)
        : nodeOps.createElement(tag, vnode) // 7-1-16 对原生创建dom的一个封装
      setScope(vnode)

      /* istanbul ignore if */
      if (__WEEX__) {
        // in Weex, the default insertion order is parent-first.
        // List items can be optimized to use children-first insertion
        // with append="tree".
        const appendAsTree = isDef(data) && isTrue(data.appendAsTree)
        if (!appendAsTree) {
          if (isDef(data)) {
            // 11-1-11 data 是 vnode的data 如果有就执行invokeCreateHooks
            invokeCreateHooks(vnode, insertedVnodeQueue)
          }
          insert(parentElm, vnode.elm, refElm)
        }
        /* 9-4-7 执行createChildren 遍历我们的children然后执行createElm方法
        在这个过程中，如果某个children有子组件，依然会再次执行createComponent递归，建立组件树，普通节点就会执行下面的插入 */
        createChildren(vnode, children, insertedVnodeQueue)
        if (appendAsTree) {
          if (isDef(data)) {
            invokeCreateHooks(vnode, insertedVnodeQueue)
          }
          /* 9-4-8 这里与普通节点不同的是，insert时，parentElm是空，在执行insert时，insert判断如果parent是空，就不做任何DOM插入 */
          insert(parentElm, vnode.elm, refElm)
        }
      } else {
        // 7-1-17 web平台逻辑 这个逻辑是说如果vnode还有子节点那么先创建子节点
        // 7-3-2 然后调用createChildren去插入子元素，所以插入顺序是先插入子元素，然后再插入父
        createChildren(vnode, children, insertedVnodeQueue)
        if (isDef(data)) {
          invokeCreateHooks(vnode, insertedVnodeQueue)
        }
        /* 7-1-20 最终调用insert去调用，传入父挂载节点，当前vnode节点，参考节点 */
        // 7-3-3 最后调insert 先插入子再插入父，父节点最终会挂载到一个真实的dom上
        insert(parentElm, vnode.elm, refElm)
      }

      if (process.env.NODE_ENV !== 'production' && data && data.pre) {
        creatingElmInVPre--
      }
    } else if (isTrue(vnode.isComment)) {
      vnode.elm = nodeOps.createComment(vnode.text)
      insert(parentElm, vnode.elm, refElm)
    } else {
      /* 7-2-2 普通的创建一个文本节点 比如说<div> {{message}} </div>, 然后添加到body（父节点）上 */
      vnode.elm = nodeOps.createTextNode(vnode.text)
      insert(parentElm, vnode.elm, refElm)
    }
  }

  // 9-1-2 createComponent方法
  // 11-1-13 createComponent 是以递归方式不断初始化子组件 以及patch子组件
  function createComponent (vnode, insertedVnodeQueue, parentElm, refElm) {
    let i = vnode.data
    if (isDef(i)) {
      const isReactivated = isDef(vnode.componentInstance) && i.keepAlive
      if (isDef(i = i.hook) && isDef(i = i.init)) {
        // 首先拿到data.hook, 以及判断hook中是否有init这个方法，最后执行init这个方法
        i(vnode, false /* hydrating */)
        /* 9-4-10 这个init方法执行的最终会完成组件的patch */
      }
      // after calling the init hook, if the vnode is a child component
      // it should've created a child instance and mounted it. the child
      // component also has set the placeholder vnode's elm.
      // in that case we can just return the element and be done.
      if (isDef(vnode.componentInstance)) {
        /* 9-4-11 patch结束后，会开始执行initComponent */
        // 11-1-14 所有子组件patch完成后，执行initComponent
        // 11-1-17 因为父组件在调用子组件时，会把子组件的patch都执行完后再往下走 所以子要先插入 父后插入
        initComponent(vnode, insertedVnodeQueue)
        insert(parentElm, vnode.elm, refElm)
        if (isTrue(isReactivated)) {
          reactivateComponent(vnode, insertedVnodeQueue, parentElm, refElm)
        }
        return true
      }
    }
  }
  function initComponent (vnode, insertedVnodeQueue) {
    if (isDef(vnode.data.pendingInsert)) {
      insertedVnodeQueue.push.apply(insertedVnodeQueue, vnode.data.pendingInsert)
      vnode.data.pendingInsert = null
    }
    /* 9-4-12 首先会把vnode.componentInstance.$el返回给vnode.elm，因为patch的结果实际上是返回dom
    那返回dom在最终执行lifecycle时，会把结果赋值给vm.$el，然后就会赋值给vnode.elm
    在最终调用insert时，parentElm是有值的，也就是说挂载的父节点是有值的，也就是组件插入是在执行insert方法时，插入顺序是先子后父。
    在执行createComponent时，它实际上是递归执行子组件的创建，render/update/patch过程 然后 patch过程中，如果又遇到组件，又会执行子组件的createComponent方法，又会执行到子组件的patch
    所以说子组件是父组件先进patch的, 也会先insert，子组件insert完之后再执行父组件的insert。  */
    vnode.elm = vnode.componentInstance.$el
    if (isPatchable(vnode)) {
        // 11-1-15 在这执行invokeCreateHooks
      invokeCreateHooks(vnode, insertedVnodeQueue)
      setScope(vnode)
    } else {
      // empty component root.
      // skip all element-related modules except for ref (#3455)
      registerRef(vnode)
      // make sure to invoke the insert hook
      /* 11-1-16 或者直接往insertedVnodeQueue插入（子组件vnode），这样的话插入过程就是先子后父，也就是说子组件会先插入到队列里面，队列前面是子组件，后面是父组件。
        因为是要在patch执行完插入子组件 那么子组件逻辑肯定会先执行 */
      insertedVnodeQueue.push(vnode)
    }
  }

  function reactivateComponent (vnode, insertedVnodeQueue, parentElm, refElm) {
    let i
    // hack for #4339: a reactivated component with inner transition
    // does not trigger because the inner node's created hooks are not called
    // again. It's not ideal to involve module-specific logic in here but
    // there doesn't seem to be a better way to do it.
    let innerNode = vnode
    while (innerNode.componentInstance) {
      innerNode = innerNode.componentInstance._vnode
      if (isDef(i = innerNode.data) && isDef(i = i.transition)) {
        for (i = 0; i < cbs.activate.length; ++i) {
          cbs.activate[i](emptyNode, innerNode)
        }
        insertedVnodeQueue.push(innerNode)
        break
      }
    }
    // unlike a newly created component,
    // a reactivated keep-alive component doesn't insert itself
    insert(parentElm, vnode.elm, refElm)
  }

  // 7-2-1 判断是否有ref，然后调用不同的方法，这两个方法都是对原生dom的封装。（最后插入dom就是用这个insert）
  function insert (parent, elm, ref) {
    if (isDef(parent)) {
      if (isDef(ref)) {
        if (nodeOps.parentNode(ref) === parent) {
          nodeOps.insertBefore(parent, elm, ref)
        }
      } else {
        nodeOps.appendChild(parent, elm)
      }
    }
  }

  function createChildren (vnode, children, insertedVnodeQueue) {
    /* 7-1-18 如果传入的是一个数组 ，就遍历children，遍历调用createElm去创建，同时把当前的vnode当作父节点插入， */
    if (Array.isArray(children)) {
      if (process.env.NODE_ENV !== 'production') {
        checkDuplicateKeys(children)
      }
      for (let i = 0; i < children.length; ++i) {
        createElm(children[i], insertedVnodeQueue, vnode.elm, null, true, children, i)
      }
    } else if (isPrimitive(vnode.text)) {
      /*7-1-19 如果传入的是一个普通对象，就直接调用appendChild方法去添加 */
      nodeOps.appendChild(vnode.elm, nodeOps.createTextNode(String(vnode.text)))
    }
  }

  function isPatchable (vnode) {
    /* 19-1-19 循环判断vnode.componentInstance，如果有vnode.componentInstance就证明vnode是组件vnode(占位符vnode)，渲染vnode没有
      如果是渲染vnode 同时又是一个占位符vnode的话 就会不断循环 直到找到一个真实的渲染vnode，而且不是组件vnode, 也就是说找到一个真实的节点，判断是否有tag，如果有tag就是可被挂载的
      也就是说这个函数就是找到一个可被挂载的节点
    */
    while (vnode.componentInstance) {
      vnode = vnode.componentInstance._vnode
    }
    return isDef(vnode.tag)
  }

  function invokeCreateHooks (vnode, insertedVnodeQueue) {
    for (let i = 0; i < cbs.create.length; ++i) {
      cbs.create[i](emptyNode, vnode)
    }
    i = vnode.data.hook // Reuse variable
    if (isDef(i)) {
      if (isDef(i.create)) i.create(emptyNode, vnode)
      // 11-1-12 判断data力如果定义了hook 就插入到insertedVnodeQueue中
      if (isDef(i.insert)) insertedVnodeQueue.push(vnode)
    }
  }

  // set scope id attribute for scoped CSS.
  // this is implemented as a special case to avoid the overhead
  // of going through the normal attribute patching process.
  function setScope (vnode) {
    let i
    if (isDef(i = vnode.fnScopeId)) {
      nodeOps.setStyleScope(vnode.elm, i)
    } else {
      let ancestor = vnode
      while (ancestor) {
        if (isDef(i = ancestor.context) && isDef(i = i.$options._scopeId)) {
          nodeOps.setStyleScope(vnode.elm, i)
        }
        ancestor = ancestor.parent
      }
    }
    // for slot content they should also get the scopeId from the host instance.
    if (isDef(i = activeInstance) &&
      i !== vnode.context &&
      i !== vnode.fnContext &&
      isDef(i = i.$options._scopeId)
    ) {
      nodeOps.setStyleScope(vnode.elm, i)
    }
  }

  function addVnodes (parentElm, refElm, vnodes, startIdx, endIdx, insertedVnodeQueue) {
    for (; startIdx <= endIdx; ++startIdx) {
      createElm(vnodes[startIdx], insertedVnodeQueue, parentElm, refElm, false, vnodes, startIdx)
    }
  }

  function invokeDestroyHook (vnode) {
    let i, j
    const data = vnode.data
    if (isDef(data)) {
      if (isDef(i = data.hook) && isDef(i = i.destroy)) i(vnode)
      for (i = 0; i < cbs.destroy.length; ++i) cbs.destroy[i](vnode)
    }
    if (isDef(i = vnode.children)) {
      for (j = 0; j < vnode.children.length; ++j) {
        invokeDestroyHook(vnode.children[j])
      }
    }
  }

  function removeVnodes (vnodes, startIdx, endIdx) {
    for (; startIdx <= endIdx; ++startIdx) {
      const ch = vnodes[startIdx]
      if (isDef(ch)) {
        if (isDef(ch.tag)) {
          removeAndInvokeRemoveHook(ch)
          invokeDestroyHook(ch)
        } else { // Text node
          removeNode(ch.elm)
        }
      }
    }
  }

  function removeAndInvokeRemoveHook (vnode, rm) {
    if (isDef(rm) || isDef(vnode.data)) {
      let i
      const listeners = cbs.remove.length + 1
      if (isDef(rm)) {
        // we have a recursively passed down rm callback
        // increase the listeners count
        rm.listeners += listeners
      } else {
        // directly removing
        rm = createRmCb(vnode.elm, listeners)
      }
      // recursively invoke hooks on child component root node
      if (isDef(i = vnode.componentInstance) && isDef(i = i._vnode) && isDef(i.data)) {
        removeAndInvokeRemoveHook(i, rm)
      }
      for (i = 0; i < cbs.remove.length; ++i) {
        cbs.remove[i](vnode, rm)
      }
      if (isDef(i = vnode.data.hook) && isDef(i = i.remove)) {
        i(vnode, rm)
      } else {
        rm()
      }
    } else {
      removeNode(vnode.elm)
    }
  }

  function updateChildren (parentElm, oldCh, newCh, insertedVnodeQueue, removeOnly) {
    let oldStartIdx = 0
    let newStartIdx = 0
    let oldEndIdx = oldCh.length - 1
    let oldStartVnode = oldCh[0]
    let oldEndVnode = oldCh[oldEndIdx]
    let newEndIdx = newCh.length - 1
    let newStartVnode = newCh[0]
    let newEndVnode = newCh[newEndIdx]
    let oldKeyToIdx, idxInOld, vnodeToMove, refElm

    // removeOnly is a special flag used only by <transition-group>
    // to ensure removed elements stay in correct relative positions
    // during leaving transitions
    const canMove = !removeOnly

    if (process.env.NODE_ENV !== 'production') {
      checkDuplicateKeys(newCh)
    }
    // 19-4-1 递归执行patchVnode 只有递归才能把全部dom树比对一遍
    while (oldStartIdx <= oldEndIdx && newStartIdx <= newEndIdx) {
      if (isUndef(oldStartVnode)) {
        oldStartVnode = oldCh[++oldStartIdx] // Vnode has been moved left
      } else if (isUndef(oldEndVnode)) {
        oldEndVnode = oldCh[--oldEndIdx]
      } else if (sameVnode(oldStartVnode, newStartVnode)) {
        patchVnode(oldStartVnode, newStartVnode, insertedVnodeQueue, newCh, newStartIdx)
        oldStartVnode = oldCh[++oldStartIdx]
        newStartVnode = newCh[++newStartIdx]
      } else if (sameVnode(oldEndVnode, newEndVnode)) {
        patchVnode(oldEndVnode, newEndVnode, insertedVnodeQueue, newCh, newEndIdx)
        oldEndVnode = oldCh[--oldEndIdx]
        newEndVnode = newCh[--newEndIdx]
      } else if (sameVnode(oldStartVnode, newEndVnode)) { // Vnode moved right
        patchVnode(oldStartVnode, newEndVnode, insertedVnodeQueue, newCh, newEndIdx)
        canMove && nodeOps.insertBefore(parentElm, oldStartVnode.elm, nodeOps.nextSibling(oldEndVnode.elm))
        oldStartVnode = oldCh[++oldStartIdx]
        newEndVnode = newCh[--newEndIdx]
      } else if (sameVnode(oldEndVnode, newStartVnode)) { // Vnode moved left
        patchVnode(oldEndVnode, newStartVnode, insertedVnodeQueue, newCh, newStartIdx)
        canMove && nodeOps.insertBefore(parentElm, oldEndVnode.elm, oldStartVnode.elm)
        oldEndVnode = oldCh[--oldEndIdx]
        newStartVnode = newCh[++newStartIdx]
      } else {
        if (isUndef(oldKeyToIdx)) oldKeyToIdx = createKeyToOldIdx(oldCh, oldStartIdx, oldEndIdx)
        idxInOld = isDef(newStartVnode.key)
          ? oldKeyToIdx[newStartVnode.key]
          : findIdxInOld(newStartVnode, oldCh, oldStartIdx, oldEndIdx)
        if (isUndef(idxInOld)) { // New element
          createElm(newStartVnode, insertedVnodeQueue, parentElm, oldStartVnode.elm, false, newCh, newStartIdx)
        } else {
          vnodeToMove = oldCh[idxInOld]
          if (sameVnode(vnodeToMove, newStartVnode)) {
            patchVnode(vnodeToMove, newStartVnode, insertedVnodeQueue, newCh, newStartIdx)
            oldCh[idxInOld] = undefined
            canMove && nodeOps.insertBefore(parentElm, vnodeToMove.elm, oldStartVnode.elm)
          } else {
            // same key but different element. treat as new element
            createElm(newStartVnode, insertedVnodeQueue, parentElm, oldStartVnode.elm, false, newCh, newStartIdx)
          }
        }
        newStartVnode = newCh[++newStartIdx]
      }
    }
    if (oldStartIdx > oldEndIdx) {
      refElm = isUndef(newCh[newEndIdx + 1]) ? null : newCh[newEndIdx + 1].elm
      addVnodes(parentElm, refElm, newCh, newStartIdx, newEndIdx, insertedVnodeQueue)
    } else if (newStartIdx > newEndIdx) {
      removeVnodes(oldCh, oldStartIdx, oldEndIdx)
    }
  }

  function checkDuplicateKeys (children) {
    const seenKeys = {}
    for (let i = 0; i < children.length; i++) {
      const vnode = children[i]
      const key = vnode.key
      if (isDef(key)) {
        if (seenKeys[key]) {
          warn(
            `Duplicate keys detected: '${key}'. This may cause an update error.`,
            vnode.context
          )
        } else {
          seenKeys[key] = true
        }
      }
    }
  }

  function findIdxInOld (node, oldCh, start, end) {
    for (let i = start; i < end; i++) {
      const c = oldCh[i]
      if (isDef(c) && sameVnode(node, c)) return i
    }
  }

  function patchVnode (
    oldVnode,
    vnode,
    insertedVnodeQueue,
    ownerArray,
    index,
    removeOnly
  ) {
    if (oldVnode === vnode) {
      return
    }

    if (isDef(vnode.elm) && isDef(ownerArray)) {
      // clone reused vnode
      vnode = ownerArray[index] = cloneVNode(vnode)
    }

    // 19-2-2 拿到原生的dom节点赋值给elm 新旧节点相同
    const elm = vnode.elm = oldVnode.elm

    if (isTrue(oldVnode.isAsyncPlaceholder)) {
      if (isDef(vnode.asyncFactory.resolved)) {
        hydrate(oldVnode.elm, vnode, insertedVnodeQueue)
      } else {
        vnode.isAsyncPlaceholder = true
      }
      return
    }

    // reuse element for static trees.
    // note we only do this if the vnode is cloned -
    // if the new node is not cloned it means the render functions have been
    // reset by the hot-reload-api and we need to do a proper re-render.
    if (isTrue(vnode.isStatic) &&
      isTrue(oldVnode.isStatic) &&
      vnode.key === oldVnode.key &&
      (isTrue(vnode.isCloned) || isTrue(vnode.isOnce))
    ) {
      vnode.componentInstance = oldVnode.componentInstance
      return
    }

    let i
    const data = vnode.data
    // 19-2-3 如果vnoed有data 并且有hook和prepatch 这就说明vnode是一个组件vnode，就会执行prepatch方法
    if (isDef(data) && isDef(i = data.hook) && isDef(i = i.prepatch)) {
      i(oldVnode, vnode)
    }
    // 19-2-6 拿新旧节点的children 如果是组件节点 children就是undefined
    const oldCh = oldVnode.children
    const ch = vnode.children
    if (isDef(data) && isPatchable(vnode)) {
      // 19-2-7 如果定义了data 并且isPatchable为true 就做一些update钩子执行
      for (i = 0; i < cbs.update.length; ++i) cbs.update[i](oldVnode, vnode)
      if (isDef(i = data.hook) && isDef(i = i.update)) i(oldVnode, vnode)
    }
    // 19-2-8 判断新vnode是否有text
    if (isUndef(vnode.text)) {
      // 19-2-10 没有text节点，那么新旧vnode是否都有同时存在children，并且children不相等的情况下 就会执行updateChildren（递归去patchVnode）
      if (isDef(oldCh) && isDef(ch)) {
        if (oldCh !== ch) updateChildren(elm, oldCh, ch, insertedVnodeQueue, removeOnly)
      } else if (isDef(ch)) {
        // 19-2-11 新vnode是有children的 而老的没有 先检测重复key
        if (process.env.NODE_ENV !== 'production') {
          checkDuplicateKeys(ch)
        }
        // 19-2-12 如果老的有text 就把老的置空 然后把新的节点插入
        if (isDef(oldVnode.text)) nodeOps.setTextContent(elm, '')
        addVnodes(elm, null, ch, 0, ch.length - 1, insertedVnodeQueue)
      } else if (isDef(oldCh)) {
        // 19-2-13 只有老的没有新的 说明新的是空 就要把老的全删掉
        removeVnodes(oldCh, 0, oldCh.length - 1)
      } else if (isDef(oldVnode.text)) {
        // 19-2-14 新旧都没有children 但是老的有text 就直接把老的text置空
        nodeOps.setTextContent(elm, '')
      }
    } else if (oldVnode.text !== vnode.text) {
      // 19-2-9 如果有text就证明只是一个普通的文本节点 新旧节点text不相等的话就直接拿text做更新
      nodeOps.setTextContent(elm, vnode.text)
    }
    if (isDef(data)) {
      // 19-2-15 然后执行 postpatch 对组件vnode会执行postpat ch 
      if (isDef(i = data.hook) && isDef(i = i.postpatch)) i(oldVnode, vnode)
    }
  }

  function invokeInsertHook (vnode, queue, initial) {
    // delay insert hooks for component root nodes, invoke them after the
    // element is really inserted
    if (isTrue(initial) && isDef(vnode.parent)) {
      vnode.parent.data.pendingInsert = queue
    } else {
      for (let i = 0; i < queue.length; ++i) {
        // 11-1-9 遍历queue 执行insert钩子
        // 11-1-18 插入完成后得知  queue[i] 其实就是每个 vnode
        queue[i].data.hook.insert(queue[i])
      }
    }
  }

  let hydrationBailed = false
  // list of modules that can skip create hook during hydration because they
  // are already rendered on the client or has no need for initialization
  // Note: style is excluded because it relies on initial clone for future
  // deep updates (#7063).
  const isRenderedModule = makeMap('attrs,class,staticClass,staticStyle,key')

  // Note: this is a browser-only function so we can assume elms are DOM nodes.
  function hydrate (elm, vnode, insertedVnodeQueue, inVPre) {
    let i
    const { tag, data, children } = vnode
    inVPre = inVPre || (data && data.pre)
    vnode.elm = elm

    if (isTrue(vnode.isComment) && isDef(vnode.asyncFactory)) {
      vnode.isAsyncPlaceholder = true
      return true
    }
    // assert node match
    if (process.env.NODE_ENV !== 'production') {
      if (!assertNodeMatch(elm, vnode, inVPre)) {
        return false
      }
    }
    if (isDef(data)) {
      if (isDef(i = data.hook) && isDef(i = i.init)) i(vnode, true /* hydrating */)
      if (isDef(i = vnode.componentInstance)) {
        // child component. it should have hydrated its own tree.
        initComponent(vnode, insertedVnodeQueue)
        return true
      }
    }
    if (isDef(tag)) {
      if (isDef(children)) {
        // empty element, allow client to pick up and populate children
        if (!elm.hasChildNodes()) {
          createChildren(vnode, children, insertedVnodeQueue)
        } else {
          // v-html and domProps: innerHTML
          if (isDef(i = data) && isDef(i = i.domProps) && isDef(i = i.innerHTML)) {
            if (i !== elm.innerHTML) {
              /* istanbul ignore if */
              if (process.env.NODE_ENV !== 'production' &&
                typeof console !== 'undefined' &&
                !hydrationBailed
              ) {
                hydrationBailed = true
                console.warn('Parent: ', elm)
                console.warn('server innerHTML: ', i)
                console.warn('client innerHTML: ', elm.innerHTML)
              }
              return false
            }
          } else {
            // iterate and compare children lists
            let childrenMatch = true
            let childNode = elm.firstChild
            for (let i = 0; i < children.length; i++) {
              if (!childNode || !hydrate(childNode, children[i], insertedVnodeQueue, inVPre)) {
                childrenMatch = false
                break
              }
              childNode = childNode.nextSibling
            }
            // if childNode is not null, it means the actual childNodes list is
            // longer than the virtual children list.
            if (!childrenMatch || childNode) {
              /* istanbul ignore if */
              if (process.env.NODE_ENV !== 'production' &&
                typeof console !== 'undefined' &&
                !hydrationBailed
              ) {
                hydrationBailed = true
                console.warn('Parent: ', elm)
                console.warn('Mismatching childNodes vs. VNodes: ', elm.childNodes, children)
              }
              return false
            }
          }
        }
      }
      if (isDef(data)) {
        let fullInvoke = false
        for (const key in data) {
          if (!isRenderedModule(key)) {
            fullInvoke = true
            invokeCreateHooks(vnode, insertedVnodeQueue)
            break
          }
        }
        if (!fullInvoke && data['class']) {
          // ensure collecting deps for deep class bindings for future updates
          traverse(data['class'])
        }
      }
    } else if (elm.data !== vnode.text) {
      elm.data = vnode.text
    }
    return true
  }

  function assertNodeMatch (node, vnode, inVPre) {
    if (isDef(vnode.tag)) {
      return vnode.tag.indexOf('vue-component') === 0 || (
        !isUnknownElement(vnode, inVPre) &&
        vnode.tag.toLowerCase() === (node.tagName && node.tagName.toLowerCase())
      )
    } else {
      return node.nodeType === (vnode.isComment ? 8 : 3)
    }
  }
  /* 7-1-7 */

  /* 7-1-10 oldVnode: 真实dom，vnode:watchdom */
  /* 9-4-2 vm.$el = vm.__patch__(vm.$el, vnode, hydrating, false) 
  这时候vm.$el是一个undefined，然后把patch的返回值返回给他
  因为vm.$el是一开始是undefined 所以相当于oldVnode也是，就会走到isUndef(oldVnode)的逻辑*/
  return function patch (oldVnode, vnode, hydrating, removeOnly) {
    // 19-1-4 oldVnode 和vnode都有值 所以跳过↓
    if (isUndef(vnode)) {
      if (isDef(oldVnode)) invokeDestroyHook(oldVnode)
      return
    }

    let isInitialPatch = false
    const insertedVnodeQueue = []

    if (isUndef(oldVnode)) {
      // empty mount (likely as component), create new root element
      /* 9-4-3 createElm传入当前渲染的vnode，第二个insertedVnodeQueue*/
      isInitialPatch = true
      createElm(vnode, insertedVnodeQueue)
    } else {
      // 19-1-5 isRealElement为false，因为执行时 oldVnode是vnode类型，不是原生节点
      const isRealElement = isDef(oldVnode.nodeType)
      // 19-1-6 新旧vnode对比 然后进行任务分发
      if (!isRealElement && sameVnode(oldVnode, vnode)) {
        // patch existing root node
        // 19-1-10 在组件更新的时候，执行patch逻辑，1，新旧节点相同会执行patchvnode，如果不同就会执行下面的逻辑
        // 19-2-1 新旧节点相同的情况
        patchVnode(oldVnode, vnode, insertedVnodeQueue, null, null, removeOnly)
      } else {
        if (isRealElement) {
          // mounting to a real element
          // check if this is server-rendered content and if we can perform
          // a successful hydration.
          if (oldVnode.nodeType === 1 && oldVnode.hasAttribute(SSR_ATTR)) {
            oldVnode.removeAttribute(SSR_ATTR)
            hydrating = true
          }
          if (isTrue(hydrating)) {
            if (hydrate(oldVnode, vnode, insertedVnodeQueue)) {
              invokeInsertHook(vnode, insertedVnodeQueue, true)
              return oldVnode
            } else if (process.env.NODE_ENV !== 'production') {
              warn(
                'The client-side rendered virtual DOM tree is not matching ' +
                'server-rendered content. This is likely caused by incorrect ' +
                'HTML markup, for example nesting block-level elements inside ' +
                '<p>, or missing <tbody>. Bailing hydration and performing ' +
                'full client-side render.'
              )
            }
          }
          // either not server-rendered, or hydration failed.
          // create an empty node and replace it

          oldVnode = emptyNodeAt(oldVnode)
        }

        // 19-1-15 通过旧节点 拿到父dom节点
        // replacing existing element
        const oldElm = oldVnode.elm // 7-1-12 真实dom 例如div#app
        const parentElm = nodeOps.parentNode(oldElm) // 7-1-13 拿div#app距离 parentElm就是body

        // create new node
        /* 7-1-14 这个函数的作用是把vnode挂载到真实的dom上 */
        // 19-1-11 分为3个步骤，1创建新的节点
        // 19-1-16 然后把新的节点通过createElm传入，并且把父占位符节点也传入 这样就知道vnode应该挂载到哪个parent上
        createElm(
          vnode,
          insertedVnodeQueue,
          // extremely rare edge case: do not insert if old element is in a
          // leaving transition. Only happens when combining transition +
          // keep-alive + HOCs. (#4590)
          oldElm._leaveCb ? null : parentElm,
          nodeOps.nextSibling(oldElm)
        )

        // update parent placeholder node element, recursively
        // 19-1-12 更新父占位符节点
        if (isDef(vnode.parent)) {
          // 19-1-17 vnode是渲染vnode 用ancestor保存父占位符节点(9-2-8)
          let ancestor = vnode.parent
          // 19-1-18 判断当前渲染的节点是否是可挂载的
          const patchable = isPatchable(vnode)
          // 19-1-20 找到占位符节点后做一些更新操作
          while (ancestor) {
            for (let i = 0; i < cbs.destroy.length; ++i) {
              cbs.destroy[i](ancestor)
            }
            // 19-1-21 然后把占位符节点的elm重新指向新的vnode的elm，elm是在createElm时拿到的，也就是做一次更新 因为dom已经发生了变化
            ancestor.elm = vnode.elm
            if (patchable) {
              // 19-1-22 如果是可被挂载的就会执行一系列的钩子
              for (let i = 0; i < cbs.create.length; ++i) {
                cbs.create[i](emptyNode, ancestor)
              }
              // #6513
              // invoke insert hooks that may have been merged by create hooks.
              // e.g. for directives that uses the "inserted" hook.
              const insert = ancestor.data.hook.insert
              if (insert.merged) {
                // start at index 1 to avoid re-invoking component mounted hook
                for (let i = 1; i < insert.fns.length; i++) {
                  insert.fns[i]()
                }
              }
            } else {
              registerRef(ancestor)
            }
            // 19-1-23 如果占位符节点同时又是渲染vnode的话（一个组件的根节点也是一个组件），那就满足这种情况，就会一直往上找，直到找到真正能被挂载的占位符节点，直到找不到就停了，然后去做父节点更新，这是一个递归的过程
            ancestor = ancestor.parent
          }
        }

        // destroy old node
        // 7-4-1 比如说 最早是<div></div> 然后会生成一个带有message的新dom节点，然后把之前的空节点删除掉
        //  19-1-13 3删除旧节点 
        // 19-1-24 最后删除节点 如果parentElm存在，如果不存在 就是父节点已经被删掉了，就会直接执行一些钩子函数
        if (isDef(parentElm)) {
          removeVnodes([oldVnode], 0, 0)
        } else if (isDef(oldVnode.tag)) {
          invokeDestroyHook(oldVnode)
        }
      }
    }
    // 11-1-8 patch最后会调用invokeInsertHook 执行 子组件 mounted
    // 11-1-10 这个insertedVnodeQueue是在插入过程中不断添加的
    invokeInsertHook(vnode, insertedVnodeQueue, isInitialPatch)
    return vnode.elm
  }
}

/* 
  19-4-2 组件更新过程核心就是新旧vnode diff 对新旧节点相同以及不同的情况下分别做不同的处理
  
  对新旧节点不同的更新流程就是创建新节点 → 更新父占位符节点 → 删除旧节点

  新旧节点相同的更新流程是去获取他们的children，根据不同情况做不同的更新逻辑
 */