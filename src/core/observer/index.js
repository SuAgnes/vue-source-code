/* @flow */

import Dep from './dep'
import VNode from '../vdom/vnode'
import { arrayMethods } from './array'
import {
  def,
  warn,
  hasOwn,
  hasProto,
  isObject,
  isPlainObject,
  isPrimitive,
  isUndef,
  isValidArrayIndex,
  isServerRendering
} from '../util/index'

const arrayKeys = Object.getOwnPropertyNames(arrayMethods)

/**
 * In some cases we may want to disable observation inside a component's
 * update computation.
 */
export let shouldObserve: boolean = true

export function toggleObserving (value: boolean) {
  // 14-1-9 这里可以改变shouldObserve
  shouldObserve = value
}

/**
 * Observer class that is attached to each observed
 * object. Once attached, the observer converts the target
 * object's property keys into getter/setters that
 * collect dependencies and dispatch updates.
 */
// 14-1-13 可以把这个Observer理解为观察者
export class Observer {
  value: any;
  dep: Dep;
  vmCount: number; // number of vms that have this object as root $data

  constructor (value: any) {
    this.value = value
    this.dep = new Dep()
    this.vmCount = 0
    // 14-1-15 def其实就是为了给目标value 去添加一个__ob__, 然后属性指向当前实例 为的就是下次再对同样的对象做处理时直接返回 见14-1-8
    def(value, '__ob__', this)
    // 14-1-16 value 可以是数组也可以是对象
    // 17-2-1 数组可以调用push 或者 splice等方法更新的逻辑 
    if (Array.isArray(value)) {
      if (hasProto) {
        // 17-2-4 大部分浏览器都支持原型链 就是把数组value的原型链指向arrayMethods
        protoAugment(value, arrayMethods)
      } else {
        copyAugment(value, arrayMethods, arrayKeys)
      }
      this.observeArray(value)
    } else {
      // 14-1-18 对象调用walk方法
      this.walk(value)
    }
  }

  /**
   * Walk through all properties and convert them into
   * getter/setters. This method should only be called when
   * value type is Object.
   */
  // 14-1-19 遍历对象上的所有属性 调用defineReactive 使用14-1-15这种方式封装一层的意义也在这，因为__ob__没有修改的必要，所以直接变成不可枚举属性，所以并不会在walk的时候调用defineReactive，defineReactive就是把对象属性变成响应式
  walk (obj: Object) {
    const keys = Object.keys(obj)
    for (let i = 0; i < keys.length; i++) {
      defineReactive(obj, keys[i])
    }
  }

  /**
   * Observe a list of Array items.
   */
  // 14-1-17 遍历了数组的每个元素 然后调用observe递归观察起来
  observeArray (items: Array<any>) {
    for (let i = 0, l = items.length; i < l; i++) {
      observe(items[i])
    }
  }
}

// helpers

/**
 * Augment a target Object or Array by intercepting
 * the prototype chain using __proto__
 */
function protoAugment (target, src: Object) {
  /* eslint-disable no-proto */
  // 17-2-2 把target的原型链指向src
  target.__proto__ = src
  /* eslint-enable no-proto */
}

/**
 * Augment a target Object or Array by defining
 * hidden properties.
 */
/* istanbul ignore next */
function copyAugment (target: Object, src: Object, keys: Array<string>) {
  for (let i = 0, l = keys.length; i < l; i++) {
  // 17-2-3 遍历key 拿到每个key再通过def把target key 指向 src[key] 是一个拷贝过程
    const key = keys[i]
    def(target, key, src[key])
  }
}

/**
 * Attempt to create an observer instance for a value,
 * returns the new observer if successfully observed,
 * or the existing observer if the value already has one.
 */

// 14-1-6 两个参数 一个值 以及是否是跟数据
export function observe (value: any, asRootData: ?boolean): Observer | void {
  // 14-1-7 如果不是object 或者是vnode return
  if (!isObject(value) || value instanceof VNode) {
    return
  }
  let ob: Observer | void
  // 14-1-8 判断是否有_ob___这个属性，如果有并且是observer的实例 就直接取__ob__
  if (hasOwn(value, '__ob__') && value.__ob__ instanceof Observer) {
    ob = value.__ob__
  } else if (
    shouldObserve &&
    // 14-1-12 非serverRendering 并且是数组或对象 并且对象是可扩展属性的 最后判断不是vue vue实例的_isVue是true
    !isServerRendering() &&
    (Array.isArray(value) || isPlainObject(value)) &&
    Object.isExtensible(value) &&
    !value._isVue
  ) {
    // 14-1-11 shouldObserve就是用来控制是否要执行new Observer
    ob = new Observer(value)
  }
  if (asRootData && ob) {
    ob.vmCount++
  }
  return ob
}

/**
 * Define a reactive property on an Object.
 */
export function defineReactive (
  // 14-1-20 参数：对象，对象属性值，初始值
  obj: Object,
  key: string,
  val: any,
  customSetter?: ?Function,
  shallow?: boolean
) {
  //  15-1-7 定义dep
  const dep = new Dep()

  // 14-1-21 通过getOwnPropertyDescriptor拿到对象属性的定义 如果这个属性的configurable是false就return
  const property = Object.getOwnPropertyDescriptor(obj, key)
  if (property && property.configurable === false) {
    return
  }

  // cater for pre-defined getter/setters
  // 14-1-22 如果有get和set就拿到
  const getter = property && property.get
  const setter = property && property.set
  if ((!getter || setter) && arguments.length === 2) {
    // 14-1-23 如果没有getter 或者有setter 并且参数长度是2，就把obj[key] 赋值给val
    val = obj[key]
  }
  // 14-1-24 子observer会再次递归调用observe 也就是当对象的某个的属性值是一个对象的话，就会递归的把整个东西都监听一遍，最终会把对象属性变成响应式对象
  let childOb = !shallow && observe(val)
  // 14-1-27  get和set在定义时都不会执行，只有当访问和赋值的时候才执行 并且vue会把props data 等全变成响应式对象
  Object.defineProperty(obj, key, {
    enumerable: true,
    configurable: true,
    // 14-1-25 访问时会触发get 主要做一些依赖收集
    get: function reactiveGetter () {
      // 15-1-1 首先拿到getter 如果没有getter就直接取val
      const value = getter ? getter.call(obj) : val
      // 15-1-2 依赖手机
      if (Dep.target) {
        // 15-1-3 Dep是一个类 主要建立数据和watcher的桥梁
        dep.depend()
        /* 17-1-13 如果有childOb 就调用 childOb.dep.depend() 去收集依赖 其实就是订阅了渲染watcher
        也可以说渲染watcher订阅了dep的变化 dep会通知渲染watcher重新做渲染 dep通知渲染的时候就是调用set方法的时候 childOb解见 14-1-24 */
        if (childOb) {
          // 15-1-9 如果子value是一个对象 并且有childOb 就调用 childOb.dep.depend() 
          childOb.dep.depend()
          if (Array.isArray(value)) {
            dependArray(value)
          }
        }
      }
      return value
    },
    // 15-1-23 其实依赖收集就是在触发getter后，会把watcher订阅到数据变化中，也就是说dep.depend()会调用当前watcher的addDep，addDep最终会调用addSub来push watcher。也就是说依赖收集其实就是收集当前计算的watcher，然后把watcher作为一个订阅者，订阅者的作用是之后在数据做修改的时候会触发setter，会通知订阅者做一些逻辑
    // 14-1-26 设置值会触发set 用来派发更新
    set: function reactiveSetter (newVal) {
      // 15-2-1 首先求值，然后和新值做对比。
      const value = getter ? getter.call(obj) : val
      /* eslint-disable no-self-compare */
      // 15-2-2 修改后值相同那么说明都不做
      if (newVal === value || (newVal !== newVal && value !== value)) {
        return
      }
      /* eslint-enable no-self-compare */
      if (process.env.NODE_ENV !== 'production' && customSetter) {
        customSetter()
      }
      // #7981: for accessor properties without setter
      if (getter && !setter) return
      
      if (setter) {
        // 15-2-3 不同的话会赋新值
        setter.call(obj, newVal)
      } else {
        val = newVal
      }
      // 15-2-4 如果新值也是一个对象 那么会重新observe把这个对象变成响应式
      childOb = !shallow && observe(newVal)
      // 15-2-5 派发更新
      dep.notify()
    }
  })
}

/**
 * Set a property on an object. Adds the new property and
 * triggers change notification if the property doesn't
 * already exist.
 */
// 17-1-2 set实现 target可以是数组也可以是对象，key可以是对象的key也可以是数组下标
export function set (target: Array<any> | Object, key: any, val: any): any {
  // 17-1-3 target 在开发环境 如果是undefined或者是基础类型 都会抛出警告
  if (process.env.NODE_ENV !== 'production' &&
    (isUndef(target) || isPrimitive(target))
  ) {
    warn(`Cannot set reactive property on undefined, null, or primitive value: ${(target: any)}`)
  }
  // 17-1-4 判断是数组 并且索引也是正确的
  if (Array.isArray(target) && isValidArrayIndex(key)) {
    // 17-1-5 首先修改数组长度 以及key的最大值
    target.length = Math.max(target.length, key)
    // 17-1-6 然后用splice插入
    target.splice(key, 1, val)
    return val
  }
  // 17-1-7 对象逻辑 判断target里有key 并且key不在原型上 如果已存在就可以直接赋值（因为可以触发渲染）
  if (key in target && !(key in Object.prototype)) {
    target[key] = val
    return val
  }

  // 17-1-8 否则就尝试取到__ob__这个属性（响应式对象有__ob__属性）
  const ob = (target: any).__ob__
  // 17-1-9 判断target是一个vue实例 或者 ob有vmCount（ob.vmCount意味是root $data也就是根数据对象）满足任何一个都报错
  if (target._isVue || (ob && ob.vmCount)) {
    process.env.NODE_ENV !== 'production' && warn(
      'Avoid adding reactive properties to a Vue instance or its root $data ' +
      'at runtime - declare it upfront in the data option.'
    )
    return val
  }
  // 17-1-10 判断target如果不是响应式对象 就是普通对象的话 也直接赋值就可以
  if (!ob) {
    target[key] = val
    return val
  }
  // 17-1-11 如果都不满足 走defineReactive，首先把新增加的key的value变成响应式
  defineReactive(ob.value, key, val)
  // 17-1-12 手动通知
  ob.dep.notify()
  return val
}

/**
 * Delete a property and trigger change if necessary.
 */
export function del (target: Array<any> | Object, key: any) {
  if (process.env.NODE_ENV !== 'production' &&
    (isUndef(target) || isPrimitive(target))
  ) {
    warn(`Cannot delete reactive property on undefined, null, or primitive value: ${(target: any)}`)
  }
  if (Array.isArray(target) && isValidArrayIndex(key)) {
    target.splice(key, 1)
    return
  }
  const ob = (target: any).__ob__
  if (target._isVue || (ob && ob.vmCount)) {
    process.env.NODE_ENV !== 'production' && warn(
      'Avoid deleting properties on a Vue instance or its root $data ' +
      '- just set it to null.'
    )
    return
  }
  if (!hasOwn(target, key)) {
    return
  }
  delete target[key]
  if (!ob) {
    return
  }
  ob.dep.notify()
}

/**
 * Collect dependencies on array elements when the array is touched, since
 * we cannot intercept array element access like property getters.
 */
function dependArray (value: Array<any>) {
  for (let e, i = 0, l = value.length; i < l; i++) {
    e = value[i]
    e && e.__ob__ && e.__ob__.dep.depend()
    if (Array.isArray(e)) {
      dependArray(e)
    }
  }
}


/* 15-1-30 总结：
依赖收集就是订阅数据变化的wathcer的收集
依赖收集的目的是为了当响应式数据发送变化触发setter的时候，能知道应该通知哪些订阅者（watcher）去做响应的逻辑处理
*/
