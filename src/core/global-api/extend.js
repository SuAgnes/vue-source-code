/* @flow */

import { ASSET_TYPES } from 'shared/constants'
import { defineComputed, proxy } from '../instance/state'
import { extend, mergeOptions, validateComponentName } from '../util/index'

export function initExtend (Vue: GlobalAPI) {
  /**
   * Each instance constructor, including Vue, has a unique
   * cid. This enables us to create wrapped "child
   * constructors" for prototypal inheritance and cache them.
   */
  Vue.cid = 0
  let cid = 1

  /**
   * Class inheritance
   */

  /* 8-1-6 Vue.extend传入一个对象，返回函数 ↓↓ */
  Vue.extend = function (extendOptions: Object): Function {
    extendOptions = extendOptions || {}
    const Super = this // 这个this 不是vm 而是Vue.extend的Vue
    const SuperId = Super.cid
    const cachedCtors = extendOptions._Ctor || (extendOptions._Ctor = {}) // 对扩展的对象添加了一个属性，先把这个属性定义成一个空对象
    if (cachedCtors[SuperId]) {
      return cachedCtors[SuperId]
    }
    /* 
      8-1-10 好处就是多个组件都去引用同一个组件的时候，构造器的创建只会执行一次，因为在此再走进来时，发现
      const cachedCtors = extendOptions._Ctor || (extendOptions._Ctor = {})
      已经拥有了extendOptions._Ctor，并且SuperId指向了cachedCtors，因为如果SuperId一样证明了是同一个父构造器，所以直接把构造器return出去
      每个组件都会有一个独立的构造器，独立的cid 
     */
    const name = extendOptions.name || Super.options.name // 配置name（组件名）
    if (process.env.NODE_ENV !== 'production' && name) {
      // 如果在开发环境，会做一层校验
      validateComponentName(name)
    }

    // 定义子构造函数
    const Sub = function VueComponent (options) {
      this._init(options) // 8-1-9 所以在这里执行_init时候，就会执行到Vue._init方法上
    }
    // 8-1-8 把子构造器原形指向了父的原型（原型继承）
    Sub.prototype = Object.create(Super.prototype)
    Sub.prototype.constructor = Sub
    Sub.cid = cid++
    // 把自身配置和Vue的配置做合并
    // 10-1-26 子组件合并
    Sub.options = mergeOptions(
      Super.options, // 大Vue的options
      extendOptions // 子组件的options
    )
    Sub['super'] = Super

    // For props and computed properties, we define the proxy getters on
    // the Vue instances at extension time, on the extended prototype. This
    // avoids Object.defineProperty calls for each instance created.

    // 初始化options和computed
    if (Sub.options.props) {
      initProps(Sub)
    }
    if (Sub.options.computed) {
      initComputed(Sub)
    }

    // allow further extension/mixin/plugin usage

    // 把一些全局静态方法赋值给sub，让sub拥有与Vue一样的能力
    Sub.extend = Super.extend
    Sub.mixin = Super.mixin
    Sub.use = Super.use

    // create asset registers, so extended classes
    // can have their private assets too.
    ASSET_TYPES.forEach(function (type) {
      Sub[type] = Super[type]
    })
    // enable recursive self-lookup
    if (name) {
      Sub.options.components[name] = Sub
    }

    // keep a reference to the super options at extension time.
    // later at instantiation we can check if Super's options have
    // been updated.
    Sub.superOptions = Super.options
    Sub.extendOptions = extendOptions
    Sub.sealedOptions = extend({}, Sub.options)

    // cache constructor
    // 最后缓存下来， 实际上就是让extendOptions._Ctor这个对象拥有了Sub这个构造器
    cachedCtors[SuperId] = Sub
    return Sub
  }
}

function initProps (Comp) {
  const props = Comp.options.props
  for (const key in props) {
    proxy(Comp.prototype, `_props`, key)
  }
}

function initComputed (Comp) {
  const computed = Comp.options.computed
  for (const key in computed) {
    defineComputed(Comp.prototype, key, computed[key])
  }
}
