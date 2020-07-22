/* @flow */

import {
  warn,
  remove,
  isObject,
  parsePath,
  _Set as Set,
  handleError,
  noop
} from '../util/index'

import { traverse } from './traverse'
import { queueWatcher } from './scheduler'
import Dep, { pushTarget, popTarget } from './dep'

import type { SimpleSet } from '../util/index'

let uid = 0

/**
 * A watcher parses an expression, collects dependencies,
 * and fires callback when the expression value changes.
 * This is used for both the $watch() api and directives.
 */
export default class Watcher {
  vm: Component;
  expression: string;
  cb: Function;
  id: number;
  deep: boolean;
  user: boolean;
  lazy: boolean;
  sync: boolean;
  dirty: boolean;
  active: boolean;
  deps: Array<Dep>;
  newDeps: Array<Dep>;
  depIds: SimpleSet;
  newDepIds: SimpleSet;
  before: ?Function;
  getter: Function;
  value: any;

  constructor (
    vm: Component,
    expOrFn: string | Function,
    cb: Function,
    options?: ?Object,
    /* 4-5-2 是否是渲染watcher的标志位 */
    isRenderWatcher?: boolean 
  ) {
    this.vm = vm
    // 18-1-12 computed逻辑 renderWatcher肯定是false
    if (isRenderWatcher) {
      // 4-5-3 isRenderWatcher传true的话在vm上加一个_watcher 
      // 11-2-10 如果是渲染watcher就会把当前watcher 赋值给 vm._watcher，所以vue的_watcher表示了一个渲染watcher
      vm._watcher = this
    }
    // 11-2-11 同时push到_watchers中
    // 18-1-13 computedWatcher也会push到这里
    vm._watchers.push(this)
    // options
    // 18-2-12 与渲染watcher与computed  watcher不同的是可以配置很多options
    if (options) {
      this.deep = !!options.deep
      this.user = !!options.user
      this.lazy = !!options.lazy // 18-1-14 刚刚配置时 lazy: true, 所以此处也是true
      this.sync = !!options.sync
      // 11-2-9 在创建watcher时会保存before
      this.before = options.before
    } else {
      this.deep = this.user = this.lazy = this.sync = false
    }
    this.cb = cb
    this.id = ++uid // uid for batching
    this.active = true
    // 18-1-15 dirty也是true
    this.dirty = this.lazy // for lazy watchers
    this.deps = []
    this.newDeps = []
    this.depIds = new Set()
    this.newDepIds = new Set()
    this.expression = process.env.NODE_ENV !== 'production'
      ? expOrFn.toString()
      : ''
    // parse expression for getter
    // 4-5-4 判断expOrFn如果是函数，如果是就把watcher的getter赋值给这个函数
    if (typeof expOrFn === 'function') {
    // 18-3-2 user-watcher时，expOrFn是个字符串，render-watcher 或computed watcher 都是函数
    // 15-1-11 对应updateComponent
      this.getter = expOrFn
      // 18-1-17 对应赋值给watcher的this.getter
    } else {
      // 4-5-5 否则调用parsePath转化一下expOrFn

      // 18-2-13 我们通常watch的是一个字符串 那么就要执行parsePath

      // 18-3-3 调用parsePath的时机
      this.getter = parsePath(expOrFn)
      if (!this.getter) {
        this.getter = noop
        process.env.NODE_ENV !== 'production' && warn(
          `Failed watching path: "${expOrFn}" ` +
          'Watcher only accepts simple dot-delimited paths. ' +
          'For full control, use a function instead.',
          vm
        )
      }
    }
    // 18-1-18 如果lazy = true， this.value 为空 computed创建过程中并不会求值，到此处就结束了
    // 18-2-16 因为是user watcher，this.lazy肯定是false, 所以会在new Watcher时对watch做一次求值
    // 18-3-4 在new watcher最后会执行get()
    this.value = this.lazy
      ? undefined
      : this.get()
  }

  /**
   * Evaluate the getter, and re-collect dependencies.
   */
  // 15-1-12 用ger对watcher做求值
  get () {
    // 15-1-14 在执行getter前 会通过pushTarget把当前的渲染wathcer作为当前计算中的wathcer
    // 18-2-17 此时的pushTarget是把user watcher push到Dep.target中
    // 18-3-4 注意 18-2-17 因为之后一些计算会访问到里面的一些数据，做依赖收集的时候会收集到user watcher中 user watcher去定义依赖的变化   
    pushTarget(this) 
    let value
    const vm = this.vm
    try {
      // 4-5-6 在这里调用getter，也就是执行updateComponent的方法
      // 15-1-15 在这里调用getter，也就是执行updateComponent的方法 updateComponent 执行时又会执行vm.render
      // 15-2-26 执行get 会再次执行getter
      /* 18-1-22 也就是说会调用get方法去求值，求值过程中就会触发getter( 因为computed会依赖一些data 或者另外的computed，所以在求值过程中，触发别的值的getter就会收集依赖，就会订阅computed watcher)
        也就是说一旦computed依赖的值发生了变化以后就会触发computedWatcher的update
      */
      //  18-2-18 然后在getter过程中，访问的任何定义的数据，依赖收集都会收集到user-watcher中，也就是说user-watch定义了数据的变化，因为call的时候把vue实例当作了参数传入，所以在求值就会访问到vm.xx/this.xx
      // 18-3-5 然后执行parsePath返回的方法  
      value = this.getter.call(vm, vm)
    } catch (e) {
      if (this.user) {
        handleError(e, vm, `getter for watcher "${this.expression}"`)
      } else {
        throw e
      }
    } finally {
      // "touch" every property so they are all tracked as
      // dependencies for deep watching
      if (this.deep) {
        // 15-1-19 dep-watcher逻辑
        traverse(value)
        // 18-4-5 一旦执行完traverse。就相当于把深层属性都访问到，这样就会触发getter，就会收集依赖，一旦做修改的时候，就会触发依赖做更新
      }
      // 15-1-20 渲染watcher执行完后回popTarget 来恢复上一次正在计算的target
      popTarget()
      // 15-1-21 清除一些依赖收集 因为每次重新渲染（数据改变时），每次数据渲染都会访问render，在访问render过程中都会重新调用addDep
      this.cleanupDeps()
    }
    return value
  }

  /**
   * Add a dependency to this directive.
   */
    addDep (dep: Dep) {
    const id = dep.id
    if (!this.newDepIds.has(id)) {
      // 15-1-27 newDeps在每次执行add时都会新增
      this.newDepIds.add(id)
      this.newDeps.push(dep)
      if (!this.depIds.has(id)) {
        // 15-1-17 如果newDepIds 和 depIds都没有id 就会执行dep.addSub(this)
        dep.addSub(this)
      }
    }
  }

  /**
   * Clean up for dependency collection.
   */
  cleanupDeps () {
    let i = this.deps.length
    // 15-1-22 调用addDep过程中就会在这里执行清除操作
    while (i--) {
      /* 15-1-29 下一次就把deps移除一遍 因为在添加dep的时候 如果不执行cleanupdeps 假如页面上没有使用到msg数据（这个数据v-if=false状态） 即使不渲染 还是会执行updateComponent
        因为每次执行cleanupDeps时会把所有dep做一次remove，每次渲染都会执行addSub 在addSub之前 addDep时会判断保证不会重复去添加旧的，但是之前已有的，不去清除 会一直在里面，当我们修改数据时 就会触发notify访问sub[i].update(), 也就是会触发重新渲染
        cleanupDeps很大的一个作用就是把所有的dep和newDepIds做一次比对，例如刚刚提到的v-if为false的msg, 在执行render时 是不会去订阅msg的变化，也就是说render过程中完全不会访问msg，所以不会有对msg属性收集依赖，在新的一轮完全不会对msg做订阅，一旦不订阅，newDepIds就不会有之前的dep。
        发现新的一轮没有订阅msg，但是老的订阅过，就会把订阅移除，再做一层交换保留之前的15-1-28，再把新的清除，就能保证没有订阅的变化不会触发重新渲染，其实就是一个性能上的提升。
        */ 
      const dep = this.deps[i]
      // 15-1-24 首先拿到已有的deps，判断如果有就remove掉 这一步第一次肯定不会执行 因为第一次deps的length为空
      if (!this.newDepIds.has(dep.id)) {
        dep.removeSub(this)
      }
    }
    // 15-1-25 交换depids 和 this.newDepIds
    let tmp = this.depIds
    this.depIds = this.newDepIds
    this.newDepIds = tmp
    // 15-1-28 新增后保留到deps和depids中，然后再在newdepids中做clear 也就是每次都是把新的用depids保留 再清空
    this.newDepIds.clear()
    tmp = this.deps
    // 15-1-26 deps 也是对newDeps的保留 也就是说deps和depids是保留之前的东西
    this.deps = this.newDeps
    this.newDeps = tmp
    this.newDeps.length = 0
  }

  /**
   * Subscriber interface.
   * Will be called when a dependency changes.
   */
  update () { 
    /* istanbul ignore else */
    if (this.lazy) {
      this.dirty = true
    } else if (this.sync) { //15-2-7 是否是同步watcher
      this.run()
    } else {
      queueWatcher(this)
    }
  }

  /**
   * Scheduler job interface.
   * Will be called by the scheduler.
   */
  run () {
    if (this.active) {
      // 15-2-23 通过this.get()再次求值，然后作对比，如果发现值不同，或者是个对象，或者是deppwatcher的话，就会执行if中的内容
      const value = this.get()
      if (
        value !== this.value ||
        // Deep watchers and watchers on Object/Arrays should fire even
        // when the value is the same, because the value may
        // have mutated.
        isObject(value) ||
        this.deep
      ) {
        // set new value
        const oldValue = this.value
        this.value = value
      // 15-2-24 判断是否是userWatcher
        if (this.user) {
          try {
            this.cb.call(this.vm, value, oldValue)
          } catch (e) {
            handleError(e, this.vm, `callback for watcher "${this.expression}"`)
          }
        } else {
        // 15-2-25 对于渲染watcher 而言，cb是一个空函数，只是对this.get()求值, 但是userwatcher的时候，cb就是watch{ msg(){ xxx }} 里写的msg函数
          this.cb.call(this.vm, value, oldValue)
        }
      }
    }
  }

  /**
   * Evaluate the value of the watcher.
   * This only gets called for lazy watchers.
   */
  evaluate () {
    // 18-1-21 调用get(), 这时候才能真正访问到computed watcher的getter
    this.value = this.get()
    this.dirty = false
  }

  /**
   * Depend on all deps collected by this watcher.
   */
  depend () {
    let i = this.deps.length
    while (i--) {
      // 18-1-30 依赖手机选人watcher
      this.deps[i].depend()
    }
  }

  /**
   * Remove self from all dependencies' subscriber list.
   */
  teardown () {
    if (this.active) {
      // remove self from vm's watcher list
      // this is a somewhat expensive operation so we skip it
      // if the vm is being destroyed.
      if (!this.vm._isBeingDestroyed) {
        remove(this.vm._watchers, this)
      }
      let i = this.deps.length
      while (i--) {
        this.deps[i].removeSub(this)
      }
      this.active = false
    }
  }
}


/* 18-3-1 如果在watch里配置了sync: true, 这个回调就会优先执行，因为默认的user-watcher都是异步的，（nextTick会执行）
  但是如果配置了sync的话，在数据改变时，就会同步执行回调, 所以会先执行
*/

// 18-4-6 其实创建watcher的过程其实就是new watcher，其次就是在new watcher过程中收集依赖，目的就是数据做变更的时候，可以触发回调执行，触发整个watcher的update重新求值 

/* 
  18-5-1: 总结

  1.计算属性本质是computed watcher
  2.侦听属性本质是user watcher，它还支持deep sync immediate等配置
  3.计算属性适合用在模板渲染中，某个值依赖了其他响应式对象 or 计算属性而来，并且计算属性不适合耦合太多逻辑
    而侦听属性适用于观察某个值的变化去完成复杂的业务，配置也更加灵活

*/