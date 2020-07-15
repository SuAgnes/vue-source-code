/* @flow */

import type Watcher from './watcher'
import config from '../config'
import { callHook, activateChildComponent } from '../instance/lifecycle'

import {
  warn,
  nextTick,
  devtools,
  inBrowser,
  isIE
} from '../util/index'

export const MAX_UPDATE_COUNT = 100

// 15-2-9 watcher数组
const queue: Array<Watcher> = []
// 15-2-10 激活children
const activatedChildren: Array<Component> = []
// 15-2-11 判断watcher是否重复添加
let has: { [key: number]: ?true } = {}
// 15-2-12 循环更新
let circular: { [key: number]: number } = {}
// 15-2-13 标志位
let waiting = false
let flushing = false
// 15-2-14 watcher索引
let index = 0

/**
 * Reset the scheduler's state.
 */
function resetSchedulerState () {
  // 15-2-30 每次执行完flushSchedulerQueue就会执行 resetSchedulerState 然后把has circular waiting flushing 重置
  index = queue.length = activatedChildren.length = 0
  has = {}
  if (process.env.NODE_ENV !== 'production') {
    circular = {}
  }
  waiting = flushing = false
}

// Async edge case #6566 requires saving the timestamp when event listeners are
// attached. However, calling performance.now() has a perf overhead especially
// if the page has thousands of event listeners. Instead, we take a timestamp
// every time the scheduler flushes and use that for all event listeners
// attached during that flush.
export let currentFlushTimestamp = 0

// Async edge case fix requires storing an event listener's attach timestamp.
let getNow: () => number = Date.now

// Determine what event timestamp the browser is using. Annoyingly, the
// timestamp can either be hi-res (relative to page load) or low-res
// (relative to UNIX epoch), so in order to compare time we have to use the
// same timestamp type when saving the flush timestamp.
// All IE versions use low-res event timestamps, and have problematic clock
// implementations (#9632)
if (inBrowser && !isIE) {
  const performance = window.performance
  if (
    performance &&
    typeof performance.now === 'function' &&
    getNow() > document.createEvent('Event').timeStamp
  ) {
    // if the event timestamp, although evaluated AFTER the Date.now(), is
    // smaller than it, it means the event is using a hi-res timestamp,
    // and we need to use the hi-res version for event listener timestamps as
    // well.
    getNow = () => performance.now()
  }
}

/**
 * Flush both queues and run the watchers.
 */
// 11-2-2 nextTick时会执行
function flushSchedulerQueue () {
  currentFlushTimestamp = getNow()
  flushing = true
  let watcher, id

  // Sort queue before flush.
  // This ensures that:
  // 1. Components are updated from parent to child. (because parent is always
  //    created before the child)
  // 2. A component's user watchers are run before its render watcher (because
  //    user watchers are created before the render watcher)
  // 3. If a component is destroyed during a parent component's watcher run,
  //    its watchers can be skipped.
  /* 15-2-19 sort排列目的
    1.组件更新从父到子，创建也是从父到子，所以要确保父watcher在前，子watcher在后
    2.当用户定义一个组件，然后写一个watcher属性，就会创建userwatcher，或者在代码中执行$watch，也是创建user-watcher
      user-watcher 在渲染watcher之前，所以userwatcher也要放在前面
    3. 当组件销毁是在父组件watcher的回调中执行时，那子组件就都不需要再执行了，就会被跳过，所以也应该是从小到大做排列
  */
  queue.sort((a, b) => a.id - b.id)

  // do not cache length because more watchers might be pushed
  // as we run existing watchers
  for (index = 0; index < queue.length; index++) {
    // 11-2-3 在这时候遍历queue 这个queue实际上每个都是watcher
    watcher = queue[index]
    if (watcher.before) {
      // 11-2-4 15-2-20 如果watcher有before会先调用before（callHook(vm, 'beforeUpdate')）
      watcher.before()
    }
    id = watcher.id
    // 15-2-21 id 置为null 然后执行watcher run
    has[id] = null
    watcher.run()
    // in dev build, check and stop circular updates.
    // 15-2-22 判断是否无限循环更新（因为run()内执行的函数，有可能再次执行queueWacher, 这样的话 queue.length就会发生改变, 就可能触发bug） 有就抛出警告
    // 15-2-33 此时就有可能抛出这个异常
    if (process.env.NODE_ENV !== 'production' && has[id] != null) {
      circular[id] = (circular[id] || 0) + 1
      // 15-2-35 每次circular都会+1 判断当代码循环执行了 MAX_UPDATE_COUNT 次后，就会抛出错误
      if (circular[id] > MAX_UPDATE_COUNT) {
        warn(
          'You may have an infinite update loop ' + (
            watcher.user
              ? `in watcher with expression "${watcher.expression}"`
              : `in a component render function.`
          ),
          watcher.vm
        )
        break
      }
    }
  }

  // 15-2-28 keep-alive逻辑 
  // keep copies of post queues before resetting state
  const activatedQueue = activatedChildren.slice()
  // 11-2-5 这个是queue的一个副本。
  const updatedQueue = queue.slice()

  resetSchedulerState()

  // call component updated and activated hooks
  callActivatedHooks(activatedQueue)
  // 11-2-6 15-2-29 然后调用callUpdatedHooks
  callUpdatedHooks(updatedQueue)

  // devtool hook
  /* istanbul ignore if */
  if (devtools && config.devtools) {
    devtools.emit('flush')
  }
}

function callUpdatedHooks (queue) {
  let i = queue.length
  // 11-2-7 遍历queue
  while (i--) {
    const watcher = queue[i]
    const vm = watcher.vm
    // 11-2-8 如果watcher是渲染watcher 并且已mounted过了（也就是第一次不会执行updated），并且数据发生变化后（因为flushSchedulerQueue是数据发生变化后执行），就会执行callHook(vm, 'updated')
    if (vm._watcher === watcher && vm._isMounted && !vm._isDestroyed) {
      // 11-2-12 所以我们在这里可以判断出如果watcher === _watcher的话，当前的watcher就是渲染watcher，只有渲染watcher才会调用callHook(vm, 'updated')
      // 11-2-13 _isMounted是在create-component.js的 insert之后
      callHook(vm, 'updated')
    }
  }
}

/**
 * Queue a kept-alive component that was activated during patch.
 * The queue will be processed after the entire tree has been patched.
 */
export function queueActivatedComponent (vm: Component) {
  // setting _inactive to false here so that a render function can
  // rely on checking whether it's in an inactive tree (e.g. router-view)
  vm._inactive = false
  activatedChildren.push(vm)
}

function callActivatedHooks (queue) {
  for (let i = 0; i < queue.length; i++) {
    queue[i]._inactive = true
    activateChildComponent(queue[i], true /* true */)
  }
}

/**
 * Push a watcher into the watcher queue.
 * Jobs with duplicate IDs will be skipped unless it's
 * pushed when the queue is being flushed.
 */
// 15-2-8 把要更新的watcher推到一个队列
export function queueWatcher (watcher: Watcher) {
  // 15-2-15 首先拿到watcher的id，因为watcher在new时同样会id自增，所以不同watcher id是不同的
  const id = watcher.id
  // 15-2-16 如果id不在has里 就设为true
  if (has[id] == null) {
    has[id] = true
    if (!flushing) {
      /* 15-2-17 把watcher push到队列里 好处是比如说同时更新了多个数据，那实际上对应的订阅者都是渲染watcher 实际上每个渲染watcher都会执行一次update
      执行多次update就是执行多次queueWatcher 如果执行多次queueWatcher has[id] = true的话，这里面逻辑就确保只会执行一次
      这样确保了watcher虽然在同一个tick内 会多次触发watcher.uodate，但是同一个watcher只会push一次 */
      queue.push(watcher)
    } else {
      // 15-2-31 在执行flushSchedulerQueue时，watcher.run时候如果又执行queueWatcher, 就会进到else，此时flushing应该是true
      // if already flushing, splice the watcher based on its id
      // if already past its id, it will be run next immediately.

      // 15-2-32 拿到当前queue的最后一位，和index(当前遍历到的索引)，然后从后往前找，要么找到index，或者是queue[i].id > watcher.id成立时，就插入到queue后面
      let i = queue.length - 1
      while (i > index && queue[i].id > watcher.id) {
        i--
      }
      queue.splice(i + 1, 0, watcher)
    }
    // queue the flush
    if (!waiting) {
      waiting = true

      if (process.env.NODE_ENV !== 'production' && !config.async) {
        flushSchedulerQueue()
        return
      }
      // 15-2-18 在下一个tick执行
      nextTick(flushSchedulerQueue)
    }
  }
}

/* 15-2-34 派发更新就是通知watcher去updete，updete会执行queueWatcher，queueWatcher又会在NickTick中执行flushSchedulerQueue
  flushSchedulerQueue过程中执行watcher.run(), watcher.run() 会执行getter，然后在执行getter过程中会再次重新渲染组件，这就是数据变化到dom变化，也就是派发更新的过程。
  
  15-2-36 当触发数据变化，组件会重新渲染，当定义user-watcher时候，user watcher去观测数据变化，当数据发生变化，user watcher的回调也会执行
  这就是派发更新的过程，响应式对象 依赖收集到派发更新 就可以了解为什么修改数据后可以自动修改视图 因为在第一次渲染的时候订阅了这些数据变化
  就是负责渲染视图的watcher去订阅了数据变化，然后一旦修改了数据，订阅数据的渲染watcher就会收到通知，就会更新，更新后就会重新渲染，整个就是一个自动化的流程

  总结：

  派发更新是当数据发生改变后，通知所有订阅了数据变化的watcher执行update

  （优化）派发更新的过程中会把所有要执行update的watcher推入到队列中，但是对同一个watcher不会重复执行，更新是在nextTike后统一执行flush，好处就是不会多次执行异步
*/