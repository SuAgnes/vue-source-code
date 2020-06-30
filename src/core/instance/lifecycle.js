/* @flow */

import config from '../config'
import Watcher from '../observer/watcher'
import { mark, measure } from '../util/perf'
import { createEmptyVNode } from '../vdom/vnode'
import { updateComponentListeners } from './events'
import { resolveSlots } from './render-helpers/resolve-slots'
import { toggleObserving } from '../observer/index'
import { pushTarget, popTarget } from '../observer/dep'

import {
  warn,
  noop,
  remove,
  emptyObject,
  validateProp,
  invokeWithErrorHandling
} from '../util/index'

export let activeInstance: any = null
export let isUpdatingChildComponent: boolean = false

export function setActiveInstance(vm: Component) {
  const prevActiveInstance = activeInstance
  // 9-1-11 把当前vm赋值给activeInstance，同时用prevActiveInstance记录
  activeInstance = vm
  /* 可以理解为把当前正在激活的vm实例赋值给activeInstance，当在初始化子组件的时候就把activeInstance作为一个参数传入（parent），
  在initLifecycle过程中拿到当前激活的vm实例，作为initLifecycle的parent */
  return () => {
    activeInstance = prevActiveInstance
  }
}
// 9-1-15 initLifecycle 用来建立父子关系
export function initLifecycle (vm: Component) {
  const options = vm.$options // 这里的vm是子组件，vm.$options是子组件实例
  
  // locate first non-abstract parent
  // 9-1-9 此处options.parent是activeInstance

  // 9-1-12 在initLifecycle时就可以拿到当前vm实例，作为parent
  let parent = options.parent // 这里是它的父组件实例
  if (parent && !options.abstract) {
    while (parent.$options.abstract && parent.$parent) {
      parent = parent.$parent
    }
  // 9-1-13 parent.$children.push(vm) 会push一个子组件的vm
    parent.$children.push(vm)
  }
  // 9-1-14 同时把子组件的vm.$parent指向父组件实例，这样就建立了一个父子关系。$parent在写很多vue插件时会用到
  vm.$parent = parent
  vm.$root = parent ? parent.$root : vm

  vm.$children = []
  vm.$refs = {}

  vm._watcher = null
  vm._inactive = null
  vm._directInactive = false
  vm._isMounted = false
  vm._isDestroyed = false
  vm._isBeingDestroyed = false
}

export function lifecycleMixin (Vue: Class<Component>) {
  // 9-3-1 这个vnode是渲染vnode
  Vue.prototype._update = function (vnode: VNode, hydrating?: boolean) {
    // 7-1-1 这些变量都是数据更新时用的，update首次渲染会调用，把vnode映射成dom，还有就是当改变数据的时候，数据改变也会驱动视图，也会调update
    const vm: Component = this
    const prevEl = vm.$el
    const prevVnode = vm._vnode
  // 9-1-10 activeInstance 赋值 是在调用_update的时候，通过setActiveInstance赋值
    const restoreActiveInstance = setActiveInstance(vm)
    /* 
      9-3-2 把渲染vnode赋值给vm._vnode，_vnode是负责渲染的，是组件的根vnode，$vnode是一个占位符vnode。
      子组件指向update的时候，会把activeInstance指向子组件实例，
      这样子组件再去创建子组件的时候，这个子组件的实例就可以作为子组件的父vue实例，可以就把父子关系通过initLifecycle时候去建立
      就是这样一个深度遍历的过程，因为js是同步执行，所以同步执行的过程中子组件的创建就是一个深度遍历的过程，这样的过程中可以不断地把当前的vue实例赋值给activeInstance
      同时通过prevActiveInstance记录上一个，也就是说执行完patch时可以恢复到上一个activeInstance。
      这样的话，activeInstance和prevActiveInstance就是一个父子的关系。  
     */

    vm._vnode = vnode
    // Vue.prototype.__patch__ is injected in entry points
    // based on the rendering backend used.
    if (!prevVnode) {
      // initial render
      /* 7-1-9 vm.$el: dom对象 */
      /* 9-4-1 update时会再次调用patch */
      vm.$el = vm.__patch__(vm.$el, vnode, hydrating, false /* removeOnly */)
    } else {
      // updates
      vm.$el = vm.__patch__(prevVnode, vnode)
    }
    restoreActiveInstance()
    // update __vue__ reference
    if (prevEl) {
      prevEl.__vue__ = null
    }
    if (vm.$el) {
      vm.$el.__vue__ = vm
    }
    // if parent is an HOC, update its $el as well
    if (vm.$vnode && vm.$parent && vm.$vnode === vm.$parent._vnode) {
      vm.$parent.$el = vm.$el
    }
    // updated hook is called by the scheduler to ensure that children are
    // updated in a parent's updated hook.
  }

  Vue.prototype.$forceUpdate = function () {
    const vm: Component = this
    if (vm._watcher) {
      vm._watcher.update()
    }
  }
  // 11-3-1 定义 destroy 方法
  Vue.prototype.$destroy = function () {
    const vm: Component = this
    if (vm._isBeingDestroyed) {
      return
    }
    // 11-3-2 先执行beforeDestroy
    callHook(vm, 'beforeDestroy')
    vm._isBeingDestroyed = true
    // remove self from parent
    const parent = vm.$parent
    if (parent && !parent._isBeingDestroyed && !vm.$options.abstract) {
      // 移除父子关系
      remove(parent.$children, vm)
    }
    // teardown watchers
    if (vm._watcher) {
      vm._watcher.teardown()
    }
    let i = vm._watchers.length
    while (i--) {
      vm._watchers[i].teardown()
    }
    // remove reference from data ob
    // frozen object may not have observer.
    if (vm._data.__ob__) {
      vm._data.__ob__.vmCount--
    }
    // call the last hook...
    vm._isDestroyed = true
    // invoke destroy hooks on current rendered tree
    // 11-3-4 通过 vm.__patch__(vm._vnode, null) 递归销毁子组件，所以说，beforeDestroy是先父后子，而destroyed也是先子后父
    // 11-3-5 也就是说父组件先执行$destroy，在执行vm.__patch__(vm._vnode, null)过程中，会执行子组件的$destroy。
    // 11-3-6 这里和mounted是很类似的
    vm.__patch__(vm._vnode, null)
    // fire destroyed hook
    // 11-3-3 一系列销毁工作结束后会执行destroyed
    callHook(vm, 'destroyed')
    // turn off all instance listeners.
    vm.$off()
    // remove __vue__ reference
    if (vm.$el) {
      vm.$el.__vue__ = null
    }
    // release circular reference (#6759)
    if (vm.$vnode) {
      vm.$vnode.parent = null
    }
  }
}
  /* 
    9-2-5 再走一遍render（子组件渲染），然后生成一个vnode，
    接下来再执行渲染watcher，watcher的getter就是updateComponent，
    然后走子组件的update，_render
  */
export function mountComponent (
  vm: Component,
  el: ?Element,
  hydrating?: boolean
  ): Component {
    /* 4-4-2 mountComponent 首先会把el这个dom 用vm.$el做缓存 */
  vm.$el = el
  /* 4-4-3 判断是否用render函数（并没有写render函数并且template没有正确转化render函数） */
  if (!vm.$options.render) {
    /* 4-4-4 那么就会创建一个空vnode，然后报一个警告
      这个错误其实就是使用了runtime-only版本 然后又写了template而不是写render函数
      或者说写了template多但是没有使用编译版本  */
    vm.$options.render = createEmptyVNode
    if (process.env.NODE_ENV !== 'production') {
      /* istanbul ignore if */
      if ((vm.$options.template && vm.$options.template.charAt(0) !== '#') ||
        vm.$options.el || el) {
        warn(
          'You are using the runtime-only build of Vue where the template ' +
          'compiler is not available. Either pre-compile the templates into ' +
          'render functions, or use the compiler-included build.',
          vm
        )
      } else {
        // 4-4-5 还有一种情况是没有写template也没有写render函数
        warn(
          'Failed to mount component: template or render function not defined.',
          vm
        )
      }
    }
  }
  // 11-1-6 在执行mountComponent时，也就是执行挂载的时候会先执行beforeMount（组件挂载前）
  // 11-1-21 不过 beforeMount 是先父后子 因为在调用mountComponent的时候 是优先执行父组件的mountComponent, 然后才会执行子组件的初始化， 子组件执行后又会调用子组件的mountComponent，所以这个过程是先父后子
  callHook(vm, 'beforeMount')
  // 4-4-6定义的updateComponent最终是一个方法
  let updateComponent
  /* istanbul ignore if */
  // 4-4-7 在开发环境并且配置了performance和mark（性能埋点相关, 也就是说vue提供了一些性能埋点让我们知道我们应用的运行状况，当程序比较卡的时候可以利用performance这些东西）
  if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
    updateComponent = () => {
      const name = vm._name
      const id = vm._uid
      const startTag = `vue-perf-start:${id}`
      const endTag = `vue-perf-end:${id}`

      mark(startTag)
      const vnode = vm._render()
      mark(endTag)
      measure(`vue ${name} render`, startTag, endTag)

      mark(startTag)
      vm._update(vnode, hydrating)
      mark(endTag)
      measure(`vue ${name} patch`, startTag, endTag)
    }
  } else {
    updateComponent = () => {
      // 4-4-8 调用vm._update，通过vm._render渲染出一个vnode，第二个参数是服务端渲染相关
      // 6-3-1 第一个参数就是刚刚调用_createElement的返回值，update把vnode生成为真实的dom
      vm._update(vm._render(), hydrating)
      /*  4-5-7 开始执行 vm._update(vm._render(), hydrating) 这两个函数就是最终挂载dom需要用的函数
        先执行render,render生成一个vnode，然后调update，把vnode传入进去 */

    }
  }

  // we set this to vm._watcher inside the watcher's constructor
  // since the watcher's initial patch may call $forceUpdate (e.g. inside child
  // component's mounted hook), which relies on vm._watcher being already defined

  /* 4-5-1 调用了一个new Watcher执行updateComponent，这是一个渲染watcher（响应式原理相关，观察者模式）
    调用new Watcher时候，第一个参数是vue实例，第二个是函数，第三个noop其实就是空函数，第四个是配置对象，第五个是Boolean*/
  new Watcher(vm, updateComponent, noop, {
    /* 4-5-8 通过watcher使用updateComponent是因为updateComponent方法实际上就是执行了一次真实的渲染
      真实的渲染过程除了首次渲染，之后在更新数据的时候还是会触发渲染watcher，再次执行updateComponent方法
      这是一个监听到执行的过程，当数据发生变化视图修改，入口也是updateComponent方法 */
    before () {
      if (vm._isMounted && !vm._isDestroyed) {
        // 11-2-1 这个函数在scheduler执行
        callHook(vm, 'beforeUpdate')
      }
    }
  }, true /* isRenderWatcher */)
  hydrating = false

  // manually mounted instance, call mounted on self
  // mounted is called for render-created child components in its inserted hook
  if (vm.$vnode == null) {
    vm._isMounted = true
  // 11-1-7 $vnode是父vnode 如果vue实例没有父vnode 说明是根Vnode 根vnode会在这个时机去调用mounted
    callHook(vm, 'mounted')
  }
  return vm
}

export function updateChildComponent (
  vm: Component,
  propsData: ?Object,
  listeners: ?Object,
  parentVnode: MountedComponentVNode,
  renderChildren: ?Array<VNode>
) {
  if (process.env.NODE_ENV !== 'production') {
    isUpdatingChildComponent = true
  }

  // determine whether component has slot children
  // we need to do this before overwriting $options._renderChildren.

  // check if there are dynamic scopedSlots (hand-written or compiled but with
  // dynamic slot names). Static scoped slots compiled from template has the
  // "$stable" marker.
  const newScopedSlots = parentVnode.data.scopedSlots
  const oldScopedSlots = vm.$scopedSlots
  const hasDynamicScopedSlot = !!(
    (newScopedSlots && !newScopedSlots.$stable) ||
    (oldScopedSlots !== emptyObject && !oldScopedSlots.$stable) ||
    (newScopedSlots && vm.$scopedSlots.$key !== newScopedSlots.$key)
  )

  // Any static slot children from the parent may have changed during parent's
  // update. Dynamic scoped slots may also have changed. In such cases, a forced
  // update is necessary to ensure correctness.
  const needsForceUpdate = !!(
    renderChildren ||               // has new static slots
    vm.$options._renderChildren ||  // has old static slots
    hasDynamicScopedSlot
  )

  vm.$options._parentVnode = parentVnode
  vm.$vnode = parentVnode // update vm's placeholder node without re-render

  if (vm._vnode) { // update child tree's parent
    vm._vnode.parent = parentVnode
  }
  vm.$options._renderChildren = renderChildren

  // update $attrs and $listeners hash
  // these are also reactive so they may trigger child update if the child
  // used them during render
  vm.$attrs = parentVnode.data.attrs || emptyObject
  vm.$listeners = listeners || emptyObject

  // update props
  if (propsData && vm.$options.props) {
    toggleObserving(false)
    const props = vm._props
    const propKeys = vm.$options._propKeys || []
    for (let i = 0; i < propKeys.length; i++) {
      const key = propKeys[i]
      const propOptions: any = vm.$options.props // wtf flow?
      props[key] = validateProp(key, propOptions, propsData, vm)
    }
    toggleObserving(true)
    // keep a copy of raw propsData
    vm.$options.propsData = propsData
  }

  // update listeners
  listeners = listeners || emptyObject
  const oldListeners = vm.$options._parentListeners
  vm.$options._parentListeners = listeners
  updateComponentListeners(vm, listeners, oldListeners)

  // resolve slots + force update if has children
  if (needsForceUpdate) {
    vm.$slots = resolveSlots(renderChildren, parentVnode.context)
    vm.$forceUpdate()
  }

  if (process.env.NODE_ENV !== 'production') {
    isUpdatingChildComponent = false
  }
}

function isInInactiveTree (vm) {
  while (vm && (vm = vm.$parent)) {
    if (vm._inactive) return true
  }
  return false
}

export function activateChildComponent (vm: Component, direct?: boolean) {
  if (direct) {
    vm._directInactive = false
    if (isInInactiveTree(vm)) {
      return
    }
  } else if (vm._directInactive) {
    return
  }
  if (vm._inactive || vm._inactive === null) {
    vm._inactive = false
    for (let i = 0; i < vm.$children.length; i++) {
      activateChildComponent(vm.$children[i])
    }
    callHook(vm, 'activated')
  }
}

export function deactivateChildComponent (vm: Component, direct?: boolean) {
  if (direct) {
    vm._directInactive = true
    if (isInInactiveTree(vm)) {
      return
    }
  }
  if (!vm._inactive) {
    vm._inactive = true
    for (let i = 0; i < vm.$children.length; i++) {
      deactivateChildComponent(vm.$children[i])
    }
    callHook(vm, 'deactivated')
  }
}

// 11-1-1 执行生命周期函数 第一个参数是组件类型的vue实例 第二个是hook（例如可以传beforeCreated, 就会执行各个阶段的生命周期）
export function callHook (vm: Component, hook: string) {
  // #7573 disable dep collection when invoking lifecycle hooks
  pushTarget()
  // 11-1-2 handlers是一个数组 数组每一个元素就是一个生命周期函数
  const handlers = vm.$options[hook]
  const info = `${hook} hook`
  if (handlers) {
    for (let i = 0, j = handlers.length; i < j; i++) {
      invokeWithErrorHandling(handlers[i], vm, null, vm, info)
    }
  }
  if (vm._hasHookEvent) {
    vm.$emit('hook:' + hook)
  }
  popTarget()
}
