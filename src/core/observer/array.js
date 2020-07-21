/*
 * not type checking this file because flow doesn't play well with
 * dynamically accessing methods on Array prototype
 */

import { def } from '../util/index'

// 17-2-5 首先拿到数组的原型 再创建一个对象arrayMethods  
const arrayProto = Array.prototype
export const arrayMethods = Object.create(arrayProto)
// 17-2-6 定义了一些数组方法
const methodsToPatch = [
  'push',
  'pop',
  'shift',
  'unshift',
  'splice',
  'sort',
  'reverse'
]

/**
 * Intercept mutating methods and emit events
 */
// 17-2-7 编译这些数组方法
methodsToPatch.forEach(function (method) {
  // cache original method
  // 17-2-8 缓存原始方法
  const original = arrayProto[method]
  // 17-2-9 改写方法
  def(arrayMethods, method, function mutator (...args) {
    // 17-2-10 首先调用原始方法
    const result = original.apply(this, args)
    // 17-2-11 拿到结果后再拿到数组的__ob__对象
    const ob = this.__ob__
    // 17-2-12 inserted 针对添加类型的方法，调用observeArray把数据变成响应式
    let inserted
    switch (method) {
      case 'push':
      case 'unshift':
        inserted = args
        break
      case 'splice':
        inserted = args.slice(2)
        break
    }
    if (inserted) ob.observeArray(inserted)
    // notify change
    // 17-2-13 最后同样手动通知
    ob.dep.notify()
    return result
  })
})

/* 17-2-14 无论是对数组的API而言 还是对于对象的修改而言 本质上都是调用ob.dep.notify() 手动去厨房watcher的更新 这样对应的渲染watcher就会重新做渲染
最核心的就是先用Child.dep.depend()做了一次依赖收集 在调用数组api或者vue.set/del时做了一次手动通知 这样就解决了监听不到（对象新增属性，删除属性，数组新增数据或者修改下标或添加数据）的问题
虽然不能触发setter 但是我们可以通过ob.dep.notify()手动通知渲染watcher的变化 */