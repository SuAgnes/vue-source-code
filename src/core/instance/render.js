/* @flow */

import {
  warn,
  nextTick,
  emptyObject,
  handleError,
  defineReactive
} from '../util/index'

import { createElement } from '../vdom/create-element'
import { installRenderHelpers } from './render-helpers/index'
import { resolveSlots } from './render-helpers/resolve-slots'
import { normalizeScopedSlots } from '../vdom/helpers/normalize-scoped-slots'
import VNode, { createEmptyVNode } from '../vdom/vnode'

import { isUpdatingChildComponent } from './lifecycle'
// 5-1-3 vm.$createElement在initRender中，这个函数在init过程中执行。
export function initRender (vm: Component) {
  vm._vnode = null // the root of the child tree
  vm._staticTrees = null // v-once cached trees
  const options = vm.$options
  const parentVnode = vm.$vnode = options._parentVnode // the placeholder node in parent tree
  const renderContext = parentVnode && parentVnode.context
  vm.$slots = resolveSlots(options._renderChildren, renderContext)
  vm.$scopedSlots = emptyObject
  // bind the createElement fn to this instance
  // so that we get proper render context inside it.
  // args order: tag, data, children, normalizationType, alwaysNormalize
  // internal version is used by render functions compiled from templates

  // 5-1-4 这个_c是被编译生成的render函数所使用的方法。
  vm._c = (a, b, c, d) => createElement(vm, a, b, c, d, false)
  // normalization is always applied for the public version, used in
  // user-written render functions.
  /* 
    5-1-5 $createElement给手写render函数提供了一个创建vnode的方法。
    var app = new Vue({
      el: 'app',
      render(createElement) {
        return createElement ('div', {
          attrs: {
            id: '#app1'
          }
        }, this.message(子节点))
      }
    })
    render 等于 <div id="app">{{message}}</div>
    区别是，如果是用<div id="app">{{message}}</div>, 这种是写在html里的，在不执行vue的时候也会把它先渲染出来
    然后再new Vue之后执行mount时候再把message去替换成真实的数据
    而使用render方法，当render函数执行完毕的时候，就会把message给替换上去。
    因为是手写render，就不会执行把template转换成render的那一步了。
    而我们挂载的元素会替换掉html里的元素，也就是说，我们即使定义了<div id="app">{{message}}</div>,也会被#app1替换掉，这也就是为什么不能在body上挂载元素，因为我们不能替换body。
  */
  //  6-2-7 vnode就是createElement的返回值
  vm.$createElement = (a, b, c, d) => createElement(vm, a, b, c, d, true)

  // $attrs & $listeners are exposed for easier HOC creation.
  // they need to be reactive so that HOCs using them are always updated
  const parentData = parentVnode && parentVnode.data

  /* istanbul ignore else */
  if (process.env.NODE_ENV !== 'production') {
    defineReactive(vm, '$attrs', parentData && parentData.attrs || emptyObject, () => {
      !isUpdatingChildComponent && warn(`$attrs is readonly.`, vm)
    }, true)
    defineReactive(vm, '$listeners', options._parentListeners || emptyObject, () => {
      !isUpdatingChildComponent && warn(`$listeners is readonly.`, vm)
    }, true)
  } else {
    defineReactive(vm, '$attrs', parentData && parentData.attrs || emptyObject, null, true)
    defineReactive(vm, '$listeners', options._parentListeners || emptyObject, null, true)
  }
}

export let currentRenderingInstance: Component | null = null

// for testing only
export function setCurrentRenderingInstance (vm: Component) {
  currentRenderingInstance = vm
}

export function renderMixin (Vue: Class<Component>) {
  // install runtime convenience helpers
  installRenderHelpers(Vue.prototype)

  Vue.prototype.$nextTick = function (fn: Function) {
    return nextTick(fn, this)
  }

  // 5-1-1 定义_render方法，返回vnode
  Vue.prototype._render = function (): VNode {
    const vm: Component = this
    const { render, _parentVnode } = vm.$options
    if (_parentVnode) {
      vm.$scopedSlots = normalizeScopedSlots(
        _parentVnode.data.scopedSlots,
        vm.$slots,
        vm.$scopedSlots
      )
    }

    // set parent vnode. this allows render functions to have access
    // to the data on the placeholder node.
    // 9-2-6 拿到父占位符 赋值给vm.$vnode，这里就是那个占位符的vnode
    vm.$vnode = _parentVnode 
    // render self
    let vnode
    try {
      // There's no need to maintain a stack because all render fns are called
      // separately from one another. Nested component's render fns are called
      // when parent component is patched.
      currentRenderingInstance = vm
      // 9-2-7 调用render.call 生成渲染vnode
      // 15-1-16 在这一步就会访问到定义在模板中的数据，就能访问到这些数据的getter了 也就是说render期间就可以访问到getter
      vnode = render.call(vm._renderProxy, vm.$createElement)
    } catch (e) {
      // ...
      // ...
    }
    // 9-2-8 渲染vnode.parent实际上最终会指向占位符vnode（父vnode)
    vnode.parent = _parentVnode
    return vnode
  }
}
