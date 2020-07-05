/* @flow */

// Vue.component('HelloWorld', function (resolve, reject){
//   require(['./HelloWorld'], function(res) {
//       // 13-1-17 此时在加载组件，加载完成后会执行resolve
//       resolve(res);
//   })
// })

import {
  warn,
  once,
  isDef,
  isUndef,
  isTrue,
  isObject,
  hasSymbol,
  isPromise,
  remove
} from 'core/util/index'

import { createEmptyVNode } from 'core/vdom/vnode'
import { currentRenderingInstance } from 'core/instance/render'

// 13-1-19 确保无论加载ESModule 还是 CommonJs 都可以正确拿到export出的对象
function ensureCtor (comp: any, base) {
  if (
    comp.__esModule ||
    (hasSymbol && comp[Symbol.toStringTag] === 'Module')
  ) {
    comp = comp.default
  }
  // 13-1-20 如果是一个对象 就直接通过extend转换为构造器
  return isObject(comp)
    ? base.extend(comp)
    : comp
}

export function createAsyncPlaceholder (
  factory: Function,
  data: ?VNodeData,
  context: Component,
  children: ?Array<VNode>,
  tag: ?string
): VNode {
  // 13-1-16 创建空vnode 空vnode最终会渲染成一个注释节点
  const node = createEmptyVNode()
  node.asyncFactory = factory
  node.asyncMeta = { data, context, children, tag }
  return node
}

export function resolveAsyncComponent (
  factory: Function,
  baseCtor: Class<Component>
): Class<Component> | void {

  // 13-3-15 error优先级非常高，所以当 factory.error 为 true 时，直接渲染error组件
  if (isTrue(factory.error) && isDef(factory.errorComp)) {
    return factory.errorComp
  }
  // 13-1-27 此时执行，会发现factory.resolved为true 13-1-21时做的保留
  // 13-3-10 调用forceRender会执行到这里，如果发现没有factory.resolved，就会发现有loading
  if (isDef(factory.resolved)) {
    return factory.resolved
  }

  const owner = currentRenderingInstance
  if (owner && isDef(factory.owners) && factory.owners.indexOf(owner) === -1) {
    // already pending

    // 13-1-10 如果有factory.owners，只是往factory.owners去push 不再执行下面的逻辑

    factory.owners.push(owner)
  }
  // 13-3-11 那就return loading组件
  if (isTrue(factory.loading) && isDef(factory.loadingComp)) {
    return factory.loadingComp
  }

  if (owner && !isDef(factory.owners)) {
    const owners = factory.owners = [owner]
    // 13-1-9 把实例保存到factory.owners
    let sync = true
    let timerLoading = null
    let timerTimeout = null

    ;(owner: any).$on('hook:destroyed', () => remove(owners, owner))
    const forceRender = (renderCompleted: boolean) => {
    // 13-1-23 遍历vm实例，执行每个实例的forceUpdate
      for (let i = 0, l = owners.length; i < l; i++) {
        (owners[i]: any).$forceUpdate()
      }

      if (renderCompleted) {
        owners.length = 0
        if (timerLoading !== null) {
          clearTimeout(timerLoading)
          timerLoading = null
        }
        if (timerTimeout !== null) {
          clearTimeout(timerTimeout)
          timerTimeout = null
        }
      }
    }

    // 13-1-11 通过once做一层包装，就是把传入的函数只执行一次
    // 13-1-18 也就是执行这里的resolve，刚刚返回的res就是组件定义
    const resolve = once((res: Object | Class<Component>) => {
      // cache resolved
      // 13-1-21 把返回的异步组件保存下来，
      // 13-2-3 在resolved执行时，仍然可以通过res拿到对象，并转化为构造器，之后逻辑就相同了
      factory.resolved = ensureCtor(res, baseCtor)
      // invoke callbacks only if this is not a synchronous resolve
      // (async resolves are shimmed as synchronous during SSR)
      if (!sync) {
        // 13-1-22 这里是false, 因为现在是在同步执行中
        forceRender(true)
      } else {
        owners.length = 0
      }
    })

    // 13-3-13 reject函数首先会抛出警告
    const reject = once(reason => {
      process.env.NODE_ENV !== 'production' && warn(
        `Failed to resolve async component: ${String(factory)}` +
        (reason ? `\nReason: ${reason}` : '')
      )
      // 13-3-14 如果发现定义了错误组件会把 factory.error 设为true
      if (isDef(factory.errorComp)) {
        factory.error = true
        forceRender(true)
      }
    })
    // 13-1-13 factory加载异步组件
    const res = factory(resolve, reject)
    // 13-2-1  13-1-13 之前都是一样的逻辑 不同的是 执行完13-1-13 会返回一个promise对象，所以会执行这里面
    if (isObject(res)) {
      if (isPromise(res)) {
        // () => Promise
        if (isUndef(factory.resolved)) {
          // 13-2-2 执行then 传入resolve, reject
          res.then(resolve, reject)
        }
      } else if (isPromise(res.component)) {
        // 13-3-1 拥有component，并且component是promise，然后调用then加载异步组件
        res.component.then(resolve, reject)
        // 13-3-2 如果定义了error 去扩展errorComp，使用ensureCtor为了确保是构造器
        if (isDef(res.error)) {
          factory.errorComp = ensureCtor(res.error, baseCtor)
        }

        if (isDef(res.loading)) {
        // 13-3-3 loading同error
          factory.loadingComp = ensureCtor(res.loading, baseCtor)
          if (res.delay === 0) {
          // 13-3-4 如果delay为0 loading会直接转，这里影响了返回值
            factory.loading = true
          } else {
            // 13-3-6 使用setTimeout
            timerLoading = setTimeout(() => {
              timerLoading = null
              // 13-3-8 如果factory.resolved（组件）和factory.error没有加载成功，就会去渲染loading
              if (isUndef(factory.resolved) && isUndef(factory.error)) {
                factory.loading = true
                // 13-3-9 调用forceRender触发渲染
                forceRender(false)
              }
            }, res.delay || 200)
          }
        }
        // 13-3-12 如果有timeout 那我们判断如果过了这个时间发现还没有resolved 就调用reject
        if (isDef(res.timeout)) {
          timerTimeout = setTimeout(() => {
            timerTimeout = null
            if (isUndef(factory.resolved)) {
              reject(
                process.env.NODE_ENV !== 'production'
                  ? `timeout (${res.timeout}ms)`
                  : null
              )
            }
          }, res.timeout)
        }
      }
    }

    sync = false
    // 13-1-14 加载到这会返回undefined

    // return in case resolved synchronously
    // 13-3-5 如果有loading 就直接返回factory.loadingComp，也就是说createComponent的返回值不再是undefined，而是直接渲染loading组件
    // 13-3-7 如果有delay的话，因为setTimeout是异步，所以loading不存在 依旧会返回undefined，undefined第一次会渲染注释节点
    return factory.loading
      ? factory.loadingComp
      : factory.resolved
  }
}

/* 13-4-0 总结
  异步组件执行的其实是2次渲染，（有loading情况等除外，如果有就是2次以上渲染）
  先渲染成注释节点，当组件加载成功后，在通过forceRender()重新渲染

  异步组件的3种实现方式中，高级异步组件的设计非常窍门，它可以通过简单的配置实现loading resolve reject timeout 4种状态

  promise设计配合了webpagk的import
*/