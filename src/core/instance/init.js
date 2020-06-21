/* @flow */

import config from '../config'
import { initProxy } from './proxy'
import { initState } from './state'
import { initRender } from './render'
import { initEvents } from './events'
import { mark, measure } from '../util/perf'
import { initLifecycle, callHook } from './lifecycle'
import { initProvide, initInjections } from './inject'
import { extend, mergeOptions, formatComponentName } from '../util/index'

let uid = 0
export function initMixin (Vue: Class<Component>) {
  // 2-2-4 实际上就是往vue的原型上挂载了一个init方法
  Vue.prototype._init = function (options?: Object) {
    const vm: Component = this
    // a uid
    vm._uid = uid++

    let startTag, endTag
    /* istanbul ignore if */
    if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
      startTag = `vue-perf-start:${vm._uid}`
      endTag = `vue-perf-end:${vm._uid}`
      mark(startTag)
    }

    // a flag to avoid this being observed
    vm._isVue = true
    // 10-1-2 这两条都是做合并配置的
    // merge options
    if (options && options._isComponent) {
      // optimize internal component instantiation
      // since dynamic options merging is pretty slow, and none of the
      // internal component options needs special treatment.
      // 9-1-7 用initInternalComponent去合并
      // 10-1-24 组件初始化时执行 这个vm是子组件实例
      initInternalComponent(vm, options)
    } else {
      /* 3-1-2把我们传入的options最后都合并到$options上
        3-1-3 vm.$options.el 其实就是 new Vue({
        el：这里的el
        data: vm.$options.data
      }) */

    // 8-1-4 在此处合并$options, 会把大vue的options会合并到vm.$options上
    // 10-1-3 执行new Vue时会执行这里 因为options._isComponent为false
      vm.$options = mergeOptions(
        resolveConstructorOptions(vm.constructor), // 10-1-5 这里是大Vue的vm.constructor
        options || {}, // 10-1-6 定义new Vue的时候传入的 new Vue({这里面的})
        vm
      )
      // 10-1-19 第一个参数是大Vue.options
      // 10-1-22 在init的时候会调用mergeOptions把new Vue的options 和 大Vue的options做合并，在调用全局mixins的时候也是调用mergeoptions
    }
    /* istanbul ignore else */
    /* 5-2-1 如果说当前在生产环境，就直接把vm._renderProxy赋值给vm, 如果是开发环境就执行initProxy  */
    if (process.env.NODE_ENV !== 'production') {
      initProxy(vm)
    } else {
      vm._renderProxy = vm
    }
    // expose real self
    /* 3-1-4 初始化函数 */
    vm._self = vm
    initLifecycle(vm)
    initEvents(vm)
    initRender(vm)
    callHook(vm, 'beforeCreate')
    initInjections(vm) // resolve injections before data/props
    initState(vm)
    initProvide(vm) // resolve provide after data/props
    callHook(vm, 'created')

    /* istanbul ignore if */
    if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
      vm._name = formatComponentName(vm, false)
      mark(endTag)
      measure(`vue ${vm._name} init`, startTag, endTag)
    }
    // 3-1-5 初始化结束 判断有没有el
    if (vm.$options.el) {
      /* 3-1-6 在mount之后转化为DOM对象（new Vue 传入一个字符串后，通过$mount做挂载。
       这个函数执行完，dom会立刻发生变化（具体实现可以从vue项目里debugger) */
      vm.$mount(vm.$options.el)
    }
  }
}

export function initInternalComponent (vm: Component, options: InternalComponentOptions) {
  // 10-1-25 vm.constructor是子组件构造器
  // 9-1-8 initInternalComponent 定义了通过vm.constructor去创建一个对象，赋值给vm.$options
  const opts = vm.$options = Object.create(vm.constructor.options)
  // 10-1-27 在实例化子组件的时候需要传入父组件的vnode和父组件的vue实例 所以_parentVnode和parent都赋值给opts
  // doing this because it's faster than dynamic enumeration.
  const parentVnode = options._parentVnode
  opts.parent = options.parent
  opts._parentVnode = parentVnode // parentVnode就是InternalComponentOptions里的_parentVnode

  const vnodeComponentOptions = parentVnode.componentOptions
  opts.propsData = vnodeComponentOptions.propsData
  opts._parentListeners = vnodeComponentOptions.listeners
  opts._renderChildren = vnodeComponentOptions.children
  opts._componentTag = vnodeComponentOptions.tag

  if (options.render) {
    opts.render = options.render
    opts.staticRenderFns = options.staticRenderFns
  }
}


export function resolveConstructorOptions (Ctor: Class<Component>) {
  let options = Ctor.options
  // 10-1-4 大Vue的suoer是undefined 所以这里面逻辑不会被执行
  if (Ctor.super) {
    const superOptions = resolveConstructorOptions(Ctor.super)
    const cachedSuperOptions = Ctor.superOptions
    if (superOptions !== cachedSuperOptions) {
      // super option changed,
      // need to resolve new options.
      Ctor.superOptions = superOptions
      // check if there are any late-modified/attached options (#4976)
      const modifiedOptions = resolveModifiedOptions(Ctor)
      // update base extend options
      if (modifiedOptions) {
        extend(Ctor.extendOptions, modifiedOptions)
      }
      options = Ctor.options = mergeOptions(superOptions, Ctor.extendOptions)
      if (options.name) {
        options.components[options.name] = Ctor
      }
    }
  }
  // 返回大Vue的options
  return options
}

function resolveModifiedOptions (Ctor: Class<Component>): ?Object {
  let modified
  const latest = Ctor.options
  const sealed = Ctor.sealedOptions
  for (const key in latest) {
    if (latest[key] !== sealed[key]) {
      if (!modified) modified = {}
      modified[key] = latest[key]
    }
  }
  return modified
}
