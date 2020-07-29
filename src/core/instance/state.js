/* @flow */

import config from '../config'
import Watcher from '../observer/watcher'
import Dep, { pushTarget, popTarget } from '../observer/dep'
import { isUpdatingChildComponent } from './lifecycle'

import {
  set,
  del,
  observe,
  defineReactive,
  toggleObserving
} from '../observer/index'

import {
  warn,
  bind,
  noop,
  hasOwn,
  hyphenate,
  isReserved,
  handleError,
  nativeWatch,
  validateProp,
  isPlainObject,
  isServerRendering,
  isReservedAttribute
} from '../util/index'

// 18-1-8 共享定义
const sharedPropertyDefinition = {
  enumerable: true,
  configurable: true,
  get: noop,
  set: noop
}
/* 
  3-3-1 proxy定义了get和set，然后通过Object.defineProperty这个方法对target, key的访问做了一层get和set
  target 其实就是vm, 也就是说vm.key.get就会执行proxyGetter()
  也就是说，当我们去访问vm.data的时候，实际上就会去访问 this[sourceKey][key] (vm._data.key)
  不过不建议访问vm._data.key 因为下划线就默认为私有属性，不应该去访问她
 */
export function proxy (target: Object, sourceKey: string, key: string) {
  sharedPropertyDefinition.get = function proxyGetter () {
    return this[sourceKey][key]
  }
  sharedPropertyDefinition.set = function proxySetter (val) {
    this[sourceKey][key] = val
  }
  Object.defineProperty(target, key, sharedPropertyDefinition)
}


export function initState (vm: Component) {
  vm._watchers = []
  const opts = vm.$options
  /* 3-2-1 判断options，如果定义了props，就会初始化props
    判断methods，如果定义了methods，就会初始化methods
    判断data，如果定义了data，就会初始化data
   */
  // 20-2-1 props 初始化
  if (opts.props) initProps(vm, opts.props)
  if (opts.methods) initMethods(vm, opts.methods)
  if (opts.data) {
    initData(vm)
  } else {
    observe(vm._data = {}, true /* asRootData */)
  }
  // 18-1-1 computed初始化
  if (opts.computed) initComputed(vm, opts.computed)
  // 18-2-1 判断是否定义watch属性
  if (opts.watch && opts.watch !== nativeWatch) {
    initWatch(vm, opts.watch)
  }
}
function initProps (vm: Component, propsOptions: Object) {
  // 20-2-2 三个阶段，1对每个prop校验、求值。2. 对求值后的prop做响应式，3.对prop做一层proxy代理
  const propsData = vm.$options.propsData || {}
  // 20-2-3 存储子组件计算后value的值
  const props = vm._props = {}
  // cache prop keys so that future props updates can iterate using Array
  // instead of dynamic object key enumeration.
  const keys = vm.$options._propKeys = []
  // 20-2-4 用在props更新时使用
  const isRoot = !vm.$parent
  // root instance props should be converted
  if (!isRoot) {
    // 14-1-10 非root 设为false
    toggleObserving(false)
  }
  
  for (const key in propsOptions) {
    keys.push(key)
    /* 20-2-5 遍历传入的propsOptions 然后使用validateProps, 参数：props对应的key，2. propsOptions 规范化的prop配置
      propsData 父组件传给子组件的prop数据，vm是组件实例
    */
    const value = validateProp(key, propsOptions, propsData, vm)
    /* istanbul ignore else */
    if (process.env.NODE_ENV !== 'production') {
      const hyphenatedKey = hyphenate(key)
      if (isReservedAttribute(hyphenatedKey) ||
          config.isReservedAttr(hyphenatedKey)) {
        warn(
          `"${hyphenatedKey}" is a reserved attribute and cannot be used as component prop.`,
          vm
        )
      }
      // 14-1-1 把props的key变成响应式的
      defineReactive(props, key, value, () => {
        if (!isRoot && !isUpdatingChildComponent) {
          warn(
            `Avoid mutating a prop directly since the value will be ` +
            `overwritten whenever the parent component re-renders. ` +
            `Instead, use a data or computed property based on the prop's ` +
            `value. Prop being mutated: "${key}"`,
            vm
          )
        }
      })
    } else {
      defineReactive(props, key, value)
    }
    // static props are already proxied on the component's prototype
    // during Vue.extend(). We only need to proxy props defined at
    // instantiation here.
    if (!(key in vm)) {
      proxy(vm, `_props`, key)
    }
  }
  toggleObserving(true)
}

// 3-2-2 分析initData
function initData (vm: Component) {
  let data = vm.$options.data
// 3-2-3 判断是不是function，还赋值给了vm._data
  data = vm._data = typeof data === 'function'
    ? getData(data, vm)
    : data || {}
  // 14-1-2 判断不是一个对象
  if (!isPlainObject(data)) {
    data = {}
    process.env.NODE_ENV !== 'production' && warn(
      'data functions should return an object:\n' +
      'https://vuejs.org/v2/guide/components.html#data-Must-Be-a-Function',
      vm
    )

  }
  // proxy data on instance
  // 14-1-3 遍历key
  const keys = Object.keys(data)
  const props = vm.$options.props
  const methods = vm.$options.methods
  let i = keys.length
  /* 
    3-2-4 这个循环判断其实就是说，不能使用重复的键名，例如，假如data里使用了msg, 那么props里或methods里等等就不可以再用了
    不能重名的原因是因为最终都会挂载到vm实例上
  */ 
  while (i--) {
    const key = keys[i]
    if (process.env.NODE_ENV !== 'production') {
      if (methods && hasOwn(methods, key)) {
        warn(
          `Method "${key}" has already been defined as a data property.`,
          vm
        )
      }
    }
    if (props && hasOwn(props, key)) {
      process.env.NODE_ENV !== 'production' && warn(
        `The data property "${key}" is already declared as a prop. ` +
        `Use prop default value instead.`,
        vm
      )
    } else if (!isReserved(key)) {
      // 3-2-5 为什么在vue里可以使用this 互相调用data或者methods等等呢，就是通过这个代理
      // 14-1-4 把data上的东西代理到vm实例上
      proxy(vm, `_data`, key)
    }
  }
  // observe data
  // 14-1-5 观测data
  observe(data, true /* asRootData */)
}

export function getData (data: Function, vm: Component): any {
  // #7573 disable dep collection when invoking data getters
  pushTarget()
  try {
  // 3-2-4 getData call了一下
    return data.call(vm, vm)
  } catch (e) {
    handleError(e, vm, `data()`)
    return {}
  } finally {
    popTarget()
  }
}

const computedWatcherOptions = { lazy: true }
function initComputed (vm: Component, computed: Object) {
  // $flow-disable-line
  // 18-1-2 缓存vm._computedWatchers的值
  const watchers = vm._computedWatchers = Object.create(null)
  // computed properties are just getters during SSR
  const isSSR = isServerRendering()

  // 18-1-3 computed是我们定义的没一个值，值既可以是函数也可以是对象
  for (const key in computed) {
    const userDef = computed[key]
    // 18-1-4 拿到getter 如果是对象就会有get属性 如果getter为null就会在开发环境报警告
    const getter = typeof userDef === 'function' ? userDef : userDef.get
    if (process.env.NODE_ENV !== 'production' && getter == null) {
      warn(
        `Getter is missing for computed property "${key}".`,
        vm
      )
    }

    if (!isSSR) {
      // 18-1-5 在非服务器渲染的情况下 在遍历阶段就实例化watcher
      // create internal watcher for the computed property.
      watchers[key] = new Watcher(
        vm, //vm实例
        getter || noop, // 18-1-16 此处的getter就是我们定义的computed函数
        noop, // 回调
        computedWatcherOptions // watcher配置
      )
    }

    // component-defined computed properties are already defined on the
    // component prototype. We only need to define computed properties defined
    // at instantiation here.
    // 18-1-6 如果key不在实例中 去执行defineComputed，可以有key，证明已经在data、props中定义过了 需要报警告。
    if (!(key in vm)) {
      defineComputed(vm, key, userDef)
    } else if (process.env.NODE_ENV !== 'production') {
      if (key in vm.$data) {
        warn(`The computed property "${key}" is already defined in data.`, vm)
      } else if (vm.$options.props && key in vm.$options.props) {
        warn(`The computed property "${key}" is already defined as a prop.`, vm)
      }
    }
  }
}

export function defineComputed (
  target: any,
  key: string,
  userDef: Object | Function
) {
  // 18-1-7 在浏览器环境 shouldCache 为true
  const shouldCache = !isServerRendering()
  if (typeof userDef === 'function') {
    // 18-1-8 如果计算属性对应的值是函数，就定义了一个get，然后执行 createComputedGetter，get为该返回值
    sharedPropertyDefinition.get = shouldCache
      ? createComputedGetter(key)
      : createGetterInvoker(userDef)
    sharedPropertyDefinition.set = noop
  } else {
    // 18-1-9 定义的是对象，那么就有get方法
    sharedPropertyDefinition.get = userDef.get
      ? shouldCache && userDef.cache !== false
        ? createComputedGetter(key)
        : createGetterInvoker(userDef.get)
      : noop
      // 18-1-10 并且也有可能有set方法 意味着可以对computed赋值 但是不建议这样做
    sharedPropertyDefinition.set = userDef.set || noop
  }
  if (process.env.NODE_ENV !== 'production' &&
      sharedPropertyDefinition.set === noop) {
    sharedPropertyDefinition.set = function () {
      warn(
        `Computed property "${key}" was assigned to but it has no setter.`,
        this
      )
    }
  }
  // 18-1-28 通过Object.defineProperty 对应target key，对应描述是sharedPropertyDefinition
  Object.defineProperty(target, key, sharedPropertyDefinition)
}

function createComputedGetter (key) {
  // 18-1-19 比如 在render过程中 真正去访问computed的值的时候，就会去触发computedGetter
  return function computedGetter () {
    // 18-1-11 当访问某一个computed的值，实际上执行此处逻辑，首先拿到对应watcher
    const watcher = this._computedWatchers && this._computedWatchers[key]
    if (watcher) {
      // 18-1-20 因为一开始构造的时候 dirty = this.lazy, 所以第一次求值的话 dirty为true，所以会调用evaluate()，
      // 18-1-23 如果computed依赖没有发生过变化，再去访问watcher.dirty就会是false
      if (watcher.dirty) {
        watcher.evaluate()
      }
      //  18-1-24 Dep.target为渲染watcher
      if (Dep.target) {
        // 18-1-24 拿到watcher后，执行depend
        watcher.depend()
      }
      return watcher.value
    }
  }
}

function createGetterInvoker(fn) {
  return function computedGetter () {
    return fn.call(this, this)
  }
}

function initMethods (vm: Component, methods: Object) {
  const props = vm.$options.props
  for (const key in methods) {
    if (process.env.NODE_ENV !== 'production') {
      if (typeof methods[key] !== 'function') {
        warn(
          `Method "${key}" has type "${typeof methods[key]}" in the component definition. ` +
          `Did you reference the function correctly?`,
          vm
        )
      }
      if (props && hasOwn(props, key)) {
        warn(
          `Method "${key}" has already been defined as a prop.`,
          vm
        )
      }
      if ((key in vm) && isReserved(key)) {
        warn(
          `Method "${key}" conflicts with an existing Vue instance method. ` +
          `Avoid defining component methods that start with _ or $.`
        )
      }
    }
    vm[key] = typeof methods[key] !== 'function' ? noop : bind(methods[key], vm)
  }
}

function initWatch (vm: Component, watch: Object) {
  for (const key in watch) {
    // 18-2-2 拿到每个handler handler可以是数组、对象或函数，如果是数组就遍历调用，不是数组直接调用
    const handler = watch[key]
    if (Array.isArray(handler)) {
      for (let i = 0; i < handler.length; i++) {
        createWatcher(vm, key, handler[i])
      }
    } else {
      createWatcher(vm, key, handler)
    }
  }
}

function createWatcher (
  vm: Component,
  expOrFn: string | Function,
  handler: any,
  options?: Object
  ) {
    // 18-2-3 如果handler是对象，就取对象中的handler属性
  if (isPlainObject(handler)) {
    options = handler
    handler = handler.handler
  }
  if (typeof handler === 'string') {
    // 18-2-4 如果是字符串 就取vm[handler]
    handler = vm[handler]
  }
  // 18-2-5 第二个参数是回调函数 可以watch expOrFn 也就是说createWatcher就是把数据转换成期望类型，然后调用$watch, $watch才是真正创建 user watcher 的
  return vm.$watch(expOrFn, handler, options)
}

export function stateMixin (Vue: Class<Component>) {
  // flow somehow has problems with directly declared definition object
  // when using Object.defineProperty, so we have to procedurally build up
  // the object here.
  const dataDef = {}
  dataDef.get = function () { return this._data }
  const propsDef = {}
  propsDef.get = function () { return this._props }
  if (process.env.NODE_ENV !== 'production') {
    dataDef.set = function () {
      warn(
        'Avoid replacing instance root $data. ' +
        'Use nested data properties instead.',
        this
      )
    }
    propsDef.set = function () {
      warn(`$props is readonly.`, this)
    }
  }
  Object.defineProperty(Vue.prototype, '$data', dataDef)
  Object.defineProperty(Vue.prototype, '$props', propsDef)

  Vue.prototype.$set = set
  Vue.prototype.$delete = del

  // 18-2-6 $watch 同样挂载到原型上 用户可以直接通过$watch去watch一个数据的变化， 与组件上编写watch属性执行逻辑相同
  Vue.prototype.$watch = function (
    expOrFn: string | Function, // 字符串的话会是user-watch的 名字
    cb: any,
    options?: Object
  ): Function {
    const vm: Component = this
    // 18-2-7 如果cb是对象（直接通过$watch，传入的就是对象），会再次通过 createWatcher 把cb变成函数
    if (isPlainObject(cb)) {
      return createWatcher(vm, expOrFn, cb, options)
    }
    options = options || {}
    // 18-2-8 user = true 证明是一个user-watcher
    options.user = true
    // 18-2-9 执行new Watcher
    const watcher = new Watcher(vm, expOrFn, cb, options)
    // 18-2-10 如果配置了immediate就立即执行1次
    if (options.immediate) {
      try {
        cb.call(vm, watcher.value)
      } catch (error) {
        handleError(error, vm, `callback for immediate watcher "${watcher.expression}"`)
      }
    }
    // 18-2-11 返回了这个函数，这个函数执行的时候会销毁watcher
    return function unwatchFn () {
      watcher.teardown()
    }
  }
}
