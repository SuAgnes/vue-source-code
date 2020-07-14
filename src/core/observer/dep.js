/* @flow */

import type Watcher from './watcher'
import { remove } from '../util/index'
import config from '../config'

let uid = 0

/**
 * A dep is an observable that can have multiple
 * directives subscribing to it.
 */
export default class Dep {
  // 15-1-4 watcher 实际上target就是表示当前计算的全局watcher 因为同一时间只有一个watcher会被计算
  static target: ?Watcher;
  id: number; //  15-1-5 每创建一个dep实例 id都自增
  subs: Array<Watcher>;

  constructor () {
    this.id = uid++
    this.subs = []
  }
  //  15-1-6 定义数据变化的watcher就会保存在subs里
  // 15-1-18 实际就是把watcher往subs里添加，此时这个watcher就相当于subs的订阅者
  addSub (sub: Watcher) {
    this.subs.push(sub)
  }

  removeSub (sub: Watcher) {
    remove(this.subs, sub)
  }
  depend () {
    //  15-1-8 判断如果有target就调用addDep 也就是watcher的addDep
    if (Dep.target) {
      Dep.target.addDep(this)
    }
  }

  notify () {
    // stabilize the subscriber list first
    const subs = this.subs.slice()
    if (process.env.NODE_ENV !== 'production' && !config.async) {
      // subs aren't sorted in scheduler if not running async
      // we need to sort them now to make sure they fire in correct
      // order
      subs.sort((a, b) => a.id - b.id)
    }
    // 15-2-6 遍历订阅者（所有订阅数据变化的watcher），然后调用update()方法
    for (let i = 0, l = subs.length; i < l; i++) {
      subs[i].update()
    }
  }
}

// The current target watcher being evaluated.
// This is globally unique because only one watcher
// can be evaluated at a time.
Dep.target = null
const targetStack = []

export function pushTarget (target: ?Watcher) {
  // 15-1-13 会把当前target赋值给Dep.target 并且 push到targetStack中，这是为了在pop的时候拿到上一个push的Dep.target
  // ？？因为嵌套组件 在执行完父就会执行子的mount，父mount的渲染watcher会执行到pushTarget，这时候就会把target push到数组中
    // ？？在子组件渲染时，再次pushTarget，这时候dep.target就是父渲染watcher  
    targetStack.push(target)
    Dep.target = target
  }
  
  export function popTarget () {
  targetStack.pop()
  Dep.target = targetStack[targetStack.length - 1]
}
