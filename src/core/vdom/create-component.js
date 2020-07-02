/* @flow */

import VNode from './vnode'
import { resolveConstructorOptions } from 'core/instance/init'
import { queueActivatedComponent } from 'core/observer/scheduler'
import { createFunctionalComponent } from './create-functional-component'

import {
  warn,
  isDef,
  isUndef,
  isTrue,
  isObject
} from '../util/index'

import {
  resolveAsyncComponent,
  createAsyncPlaceholder,
  extractPropsFromVNodeData
} from './helpers/index'

import {
  callHook,
  activeInstance,
  updateChildComponent,
  activateChildComponent,
  deactivateChildComponent
} from '../instance/lifecycle'

import {
  isRecyclableComponent,
  renderRecyclableComponentTemplate
} from 'weex/runtime/recycle-list/render-component-template'

// inline hooks to be invoked on component VNodes during patch

// 8-2-7 每个组件都有的默认hooks
const componentVNodeHooks = {
  // 9-1-3 从patch的i(vnode, false /* hydrating */)执行到这里
  init (vnode: VNodeWithData, hydrating: boolean): ?boolean {
    if (
      vnode.componentInstance &&
      !vnode.componentInstance._isDestroyed &&
      vnode.data.keepAlive
    ) {
      // keep-alive逻辑
      // kept-alive components, treat as a patch
      const mountedNode: any = vnode // work around flow
      componentVNodeHooks.prepatch(mountedNode, mountedNode)
    } else {
      const child = vnode.componentInstance = createComponentInstanceForVnode(
        vnode,
        activeInstance
        ) // 9-2-1 createComponentInstanceForVnode实际上是返回子组件的实例
        // 9-1-4 返回一个vm实例 传入了组件的vnode，activeInstance
        // 9-2-2 patch的i(vnode, false) 所以hydrating是false，所以是undefined
      child.$mount(hydrating ? vnode.elm : undefined, hydrating)
    }
  },

  prepatch (oldVnode: MountedComponentVNode, vnode: MountedComponentVNode) {
    const options = vnode.componentOptions
    const child = vnode.componentInstance = oldVnode.componentInstance
    updateChildComponent(
      child,
      options.propsData, // updated props
      options.listeners, // updated listeners
      vnode, // new parent vnode
      options.children // new children
    )
  },
  // 11-1-19 在这里定义的insert hook
  insert (vnode: MountedComponentVNode) {
    const { context, componentInstance } = vnode
    // 11-1-20 如果子组件没有 _isMounted，就会调用callHook 把子组件实例传给他，也就是说子组件的mounted会优先于父组件，因为子组件的vnode是优先插入到队列里，所以最终patch完成后调用队列钩子函数的时候，子组件的insert钩子会先执行，不过这是不考虑异步组件的情况
    // 11-2-14 也就是说 首次渲染 这里只会执行mounted 再次重新渲染的时候才会执行updated
    if (!componentInstance._isMounted) {
      componentInstance._isMounted = true
      callHook(componentInstance, 'mounted')
    }
    if (vnode.data.keepAlive) {
      if (context._isMounted) {
        // vue-router#1212
        // During updates, a kept-alive component's child components may
        // change, so directly walking the tree here may call activated hooks
        // on incorrect children. Instead we push them into a queue which will
        // be processed after the whole patch process ended.
        queueActivatedComponent(componentInstance)
      } else {
        activateChildComponent(componentInstance, true /* direct */)
      }
    }
  },

  destroy (vnode: MountedComponentVNode) {
    const { componentInstance } = vnode
    if (!componentInstance._isDestroyed) {
      if (!vnode.data.keepAlive) {
        componentInstance.$destroy()
      } else {
        deactivateChildComponent(componentInstance, true /* direct */)
      }
    }
  }
}

// 8-2-6
const hooksToMerge = Object.keys(componentVNodeHooks)

// 8-1-2 createComponent实现
export function createComponent (
  Ctor: Class<Component> | Function | Object | void, // 可以是组件类型的类、函数、对象
  data: ?VNodeData,
  context: Component, // vm实例
  children: ?Array<VNode>, // 子vnode
  tag?: string
): VNode | Array<VNode> | void {
  if (isUndef(Ctor)) {
    return
  }
  // 8-1-3 在初始化全局api的时候，global-api/index.js 有一句Vue.options._base = Vue, 所以baseCtor实际上就是vue，也就是说，组件构造器的生成继承大Vue，也拥有了Vue的很多能力
  const baseCtor = context.$options._base

  // plain options object: turn it into a constructor
  // 12-3-5 这里就不会满足 所以不会执行extend，因为在执行Vue.component过程中 已经执行了extend，已经从一个对象转化为构造器了
  // 13-1-6 因为Ctor是函数所以不满足条件
  if (isObject(Ctor)) {
    Ctor = baseCtor.extend(Ctor) // 8-1-5 用extend方法把我们的对象转化成一个新的构造器
  }

  // if at this stage it's not a constructor or an async component factory,
  // reject.
  // 8-2-1 如果不是返回一个函数 就报错
  if (typeof Ctor !== 'function') {
    if (process.env.NODE_ENV !== 'production') {
      warn(`Invalid Component definition: ${String(Ctor)}`, context)
    }
    return
  }

  // async component
  // 8-2-2 异步组件逻辑
  let asyncFactory
  // 13-1-7 因为是工厂函数所以也没有cid，所以满足逻辑，加载异步组件
  if (isUndef(Ctor.cid)) {
    // 13-1-26 发现没有cid 还会执行resolveAsyncComponent
    asyncFactory = Ctor
    // 13-1-8 asyncFactory 工厂函数、baseCtor是大Vue
    Ctor = resolveAsyncComponent(asyncFactory, baseCtor)
      // 13-1-28 返回构造器后 就不再是 undefined，之后可以执行同步组件过程，最后会正确patch出组件
    if (Ctor === undefined) {
      // 13-1-15 判断是undefined 执行createAsyncPlaceholder
      // return a placeholder node for async component, which is rendered
      // as a comment node but preserves all the raw information for the node.
      // the information will be used for async server-rendering and hydration.
      return createAsyncPlaceholder(
        asyncFactory,
        data,
        context,
        children,
        tag
      )
    }
  }

  data = data || {}

  // resolve constructor options in case global mixins are applied after
  // component constructor creation
  // 8-2-3 会对options重新做计算，因为有可能会被全局的mixin影响
  resolveConstructorOptions(Ctor)
  // transform component v-model data into props & events
  if (isDef(data.model)) {
    transformModel(Ctor.options, data)
  }

  // extract props
  const propsData = extractPropsFromVNodeData(data, Ctor, tag)

  // functional component
  // 对函数组件的处理
  if (isTrue(Ctor.options.functional)) {
    return createFunctionalComponent(Ctor, propsData, data, context, children)
  }

  // extract listeners, since these needs to be treated as
  // child component listeners instead of DOM listeners
  // 对自定义事件的一些处理
  const listeners = data.on
  // replace with listeners with .native modifier
  // so it gets processed during parent component patch.
  data.on = data.nativeOn

  if (isTrue(Ctor.options.abstract)) {
    // abstract components do not keep anything
    // other than props & listeners & slot

    // work around flow
    const slot = data.slot
    data = {}
    if (slot) {
      data.slot = slot
    }
  }

  // install component management hooks onto the placeholder node

  /* 8-2-4 安装一些组件的钩子 在patch过程中，不同阶段会执行不同的钩子 */
  installComponentHooks(data)

  // return a placeholder vnode
  const name = Ctor.options.name || tag
  /* 
    8-4-1 最后生成v-node 如果调试时候看到vnode有vue-component标识，就证明是一个组件。
    第三个参数对应children，也就是组件的children是空，text和elm都是空，但是componentOptions（{ Ctor, propsData, listeners, tag, children }）包含了children, 其实这个children是在插槽中用到的
   */
  const vnode = new VNode(
    `vue-component-${Ctor.cid}${name ? `-${name}` : ''}`,
    data, undefined, undefined, undefined, context,
    { Ctor, propsData, listeners, tag, children },
    asyncFactory
  )

  // Weex specific: invoke recycle-list optimized @render function for
  // extracting cell-slot template.
  // https://github.com/Hanks10100/weex-native-directive/tree/master/component
  /* istanbul ignore if */
  if (__WEEX__ && isRecyclableComponent(vnode)) {
    return renderRecyclableComponentTemplate(vnode)
  }

  return vnode
}

// 9-1-5 createComponentInstanceForVnode
export function createComponentInstanceForVnode (
  vnode: any, // we know it's MountedComponentVNode but flow doesn't
  parent: any, // activeInstance in lifecycle state vm实例
): Component {
  const options: InternalComponentOptions = {
    _isComponent: true,
    _parentVnode: vnode, // 父vnode（占位符vnode）
    parent // 当前vm实例，作为当前子组件的父级vm实例
  }
  // check inline-template render functions
  const inlineTemplate = vnode.data.inlineTemplate
  if (isDef(inlineTemplate)) {
    options.render = inlineTemplate.render
    options.staticRenderFns = inlineTemplate.staticRenderFns
  }
  // 9-1-6 实际上就是执行extend中定义的Sub构造函数 sub执行子组件的构造函数以及子组件的init方法 init方法回到vue的初始化
  return new vnode.componentOptions.Ctor(options)
}

// 8-2-5 installComponentHooks实现
function installComponentHooks (data: VNodeData) {
  const hooks = data.hook || (data.hook = {})
  // 8-2-8 遍历钩子 把componentVNodeHooks merge到hooks
  for (let i = 0; i < hooksToMerge.length; i++) {
    const key = hooksToMerge[i]
    const existing = hooks[key]
    const toMerge = componentVNodeHooks[key]
    if (existing !== toMerge && !(existing && existing._merged)) {
      hooks[key] = existing ? mergeHook(toMerge, existing) : toMerge
    }
  }
}

function mergeHook (f1: any, f2: any): Function {
  // 8-3-1 如果说data.hooks已经拥有了某个hook，就会合并函数，然后依次执行
  const merged = (a, b) => {
    // flow complains about extra args which is why we use any
    f1(a, b)
    f2(a, b)
  }
  merged._merged = true
  return merged
}

// transform component v-model info (value and callback) into
// prop and event handler respectively.
function transformModel (options, data: any) {
  const prop = (options.model && options.model.prop) || 'value'
  const event = (options.model && options.model.event) || 'input'
  ;(data.attrs || (data.attrs = {}))[prop] = data.model.value
  const on = data.on || (data.on = {})
  const existing = on[event]
  const callback = data.model.callback
  if (isDef(existing)) {
    if (
      Array.isArray(existing)
        ? existing.indexOf(callback) === -1
        : existing !== callback
    ) {
      on[event] = [callback].concat(existing)
    }
  } else {
    on[event] = callback
  }
}
