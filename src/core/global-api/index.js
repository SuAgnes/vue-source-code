/* @flow */

import config from '../config'
import { initUse } from './use'
import { initMixin } from './mixin'
import { initExtend } from './extend'
import { initAssetRegisters } from './assets'
import { set, del } from '../observer/index'
import { ASSET_TYPES } from 'shared/constants'
import builtInComponents from '../components/index'
import { observe } from 'core/observer/index'

import {
  warn,
  extend,
  nextTick,
  mergeOptions,
  defineReactive
} from '../util/index'

export function initGlobalAPI (Vue: GlobalAPI) {
  // config
  const configDef = {}
  configDef.get = () => config // 2-3-4 configDef来源
  if (process.env.NODE_ENV !== 'production') {
    configDef.set = () => {
      warn(
        'Do not replace the Vue.config object, set individual fields instead.'
      )
    }
  }
  // 2-3-3 往vue的config上定义了configDef
  Object.defineProperty(Vue, 'config', configDef)

  // exposed util methods.
  // NOTE: these are not considered part of the public API - avoid relying on
  // them unless you are aware of the risk.
  // 2-4-1 定义了一些util方法 不过vue官方不建议去使用这些util方法，因为内部实现不稳定，有风险（可能会改变实现方法）
  Vue.util = {
    warn,
    extend,
    mergeOptions,
    defineReactive
  }
// 2-4-2 其他方法
  // 17-1-1 定义
  Vue.set = set
  Vue.delete = del
  // 16-1-3 调用3 赋值给Vue的nextTick
  Vue.nextTick = nextTick

  // 2.6 explicit observable API
  Vue.observable = <T>(obj: T): T => {
    observe(obj)
    return obj
  }
  </T>
  // 2-4-3 options 其实可以用来合并一些方法
  // 10-1-20 Vue.options定义的位置 一开始是一个空对象，然后把 ASSET_TYPES 扩展到 Vue.options
  Vue.options = Object.create(null)
  // 2-5-1 去shared/constants看ASSET_TYPES
  ASSET_TYPES.forEach(type => {
    Vue.options[type + 's'] = Object.create(null)
  })

  // this is used to identify the "base" constructor to extend all plain-object
  // components with in Weex's multi-instance scenarios.
  Vue.options._base = Vue
  // 2-5-2 builtInComponents其实是一个内置组件 详见components/index
  // 2-5-4 也就是说KeepAlive其实是vue的一个内置组件，通过extend方法扩展到Vue.options.components下面
  // 10-1-21 扩展一些内置组件 keep-alive/transition/transition-group之列
  extend(Vue.options.components, builtInComponents)
  // 2-5-5
  initUse(Vue) // 创造Vue.use()方法
  initMixin(Vue) // 定义全局mixin方法
  initExtend(Vue) // 定义vue的extend方法
  initAssetRegisters(Vue) // 把刚刚拿到的方法定义到全局
}

// 2-6-1 在初始化过程中 vue完成了全局方法的定义，一旦vue把这些方法定义了以后，才可以在代码中使用这些方法。
// 这些方法不是凭空而来，而是在完成import vue的过程中定义了这些全局方法。

// 2-6-2 vue的初始化过程：1、找到vue的定义。2、然后了解到在Vue下面通过mixin方法给原型挂载了很多原型方法。3、又通过initGlobalApi（global-api/index.js）给vue挂载了很多静态方法。
// 然后就可以在代码中使用了