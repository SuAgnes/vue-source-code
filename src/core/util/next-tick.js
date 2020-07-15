/* @flow */
/* globals MutationObserver */
// 16-1-1 数据变化到DOM是异步过程 nextTick对外暴露的的接口之一就是在内部去更新数据，触发重新循环，在flushSchedulerQueue调用 nextTick
import { noop } from 'shared/util'
import { handleError } from './error'
import { isIE, isIOS, isNative } from './env'

export let isUsingMicroTask = false

const callbacks = []
let pending = false
// 16-2-4 在这一步遍历callbacks，再挨个执行
function flushCallbacks () {
  pending = false
  const copies = callbacks.slice(0)
  callbacks.length = 0
  for (let i = 0; i < copies.length; i++) {
    copies[i]()
  }
}

// Here we have async deferring wrappers using microtasks.
// In 2.5 we used (macro) tasks (in combination with microtasks).
// However, it has subtle problems when state is changed right before repaint
// (e.g. #6813, out-in transitions).
// Also, using (macro) tasks in event handler would cause some weird behaviors
// that cannot be circumvented (e.g. #7109, #7153, #7546, #7834, #8109).
// So we now use microtasks everywhere, again.
// A major drawback of this tradeoff is that there are some scenarios
// where microtasks have too high a priority and fire in between supposedly
// sequential events (e.g. #4521, #6690, which have workarounds)
// or even between bubbling of the same event (#6566).
let timerFunc

// The nextTick behavior leverages the microtask queue, which can be accessed
// via either native Promise.then or MutationObserver.
// MutationObserver has wider support, however it is seriously bugged in
// UIWebView in iOS >= 9.3.3 when triggered in touch event handlers. It
// completely stops working after triggering a few times... so, if native
// Promise is available, we will use it:
/* istanbul ignore next, $flow-disable-line */

// 16-1-4 判断当前浏览器支持promise 并且是浏览器的原生方法
if (typeof Promise !== 'undefined' && isNative(Promise)) {
  const p = Promise.resolve()
  // 16-1-5 如果支持promise timerFunc就用promise实现
  timerFunc = () => {
    p.then(flushCallbacks)
    // In problematic UIWebViews, Promise.then doesn't completely break, but
    // it can get stuck in a weird state where callbacks are pushed into the
    // microtask queue but the queue isn't being flushed, until the browser
    // needs to do some other work, e.g. handle a timer. Therefore we can
    // "force" the microtask queue to be flushed by adding an empty timer.
    if (isIOS) setTimeout(noop)
  }
  // 16-1-6 微任务标识 为true
  isUsingMicroTask = true
} else if (!isIE && typeof MutationObserver !== 'undefined' && ( // 16-1-7 非ID浏览器并且拥有MutationObserver
  isNative(MutationObserver) ||
  // PhantomJS and iOS 7.x
  MutationObserver.toString() === '[object MutationObserverConstructor]'
)) {
  // Use MutationObserver where native Promise is not available,
  // e.g. PhantomJS, iOS7, Android 4.4
  // (#6466 MutationObserver is unreliable in IE11)
  // 16-1-8-0 promise不可用的备选方案
  let counter = 1
  const observer = new MutationObserver(flushCallbacks)
  // 16-1-8-1 被观察的节点（文本节点传入1）
  const textNode = document.createTextNode(String(counter))
  // 16-1-8-2 传入观测节点 textNode 及其配置
  observer.observe(textNode, {
    characterData: true
  })
  timerFunc = () => {
    counter = (counter + 1) % 2
    textNode.data = String(counter)
  }
  isUsingMicroTask = true
  // 16-1-9 逐步降级为宏任务执行 setImmediate和setTimeout
} else if (typeof setImmediate !== 'undefined' && isNative(setImmediate)) {
  // Fallback to setImmediate.
  // Technically it leverages the (macro) task queue,
  // but it is still a better choice than setTimeout.
  timerFunc = () => {
    setImmediate(flushCallbacks)
  }
} else {
  // Fallback to setTimeout.
  timerFunc = () => {
    setTimeout(flushCallbacks, 0)
  }
}

// 16-2-1 传入一个回调
export function nextTick (cb?: Function, ctx?: Object) {
  let _resolve
  // 16-2-2 push一个匿名函数，通过try catch执行，不直接push cb的原因是为了保证某一个回调函数执行失败的时候 在报错的同时并不影响整个js执行，因为js是单线程的，如果不用try catch 就会断掉
  callbacks.push(() => {
    if (cb) {
      try {
        cb.call(ctx)
      } catch (e) {
        handleError(e, ctx, 'nextTick')
      }
    } else if (_resolve) {
      // 16-2-7 此处就是执行每个cb的时候，发现如果没有cb，并且有_resolve，就执行_resolve 
      _resolve(ctx)
    }
  })
  if (!pending) {
    pending = true
    // 16-2-3 确保只执行一次nextTick，不过这些代码也会在下一个任务里才会执行，因为是异步的，当前任务内无论执行多少次nexttick，都会把cb收集到callbacks中
    timerFunc()
  }
  // 16-2-5 如果不传cb 通过nextTick.then执行的话，不管是原生promise还是因为polyfill这种形式实现 都会return一个promise实例，这就是nextTick可以用then执行的原因
  // $flow-disable-line
  if (!cb && typeof Promise !== 'undefined') {
    return new Promise(resolve => {
      // 16-2-6 resolve会被赋值给_resolve
      _resolve = resolve
    })
  }
}

/**
   16-3-1 nextTick 整个实现并不难，实际上就是把所有要执行的函数收集起来，到callback数组中，再在下一个tick中把收集完的数组进行遍历，然后执行每个回调。

   数据改变后触发渲染watcher的update，但是watchers的flush是在nextTick后，所以重新渲染是异步的
 * 
 */
