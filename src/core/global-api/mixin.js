/* @flow */

import { mergeOptions } from '../util/index'

// 10-1-1 定义 mixin
export function initMixin (Vue: GlobalAPI) {
  Vue.mixin = function (mixin: Object) {
    // 通过mergeOptions合并配置
    // 10-1-23 会把全局mixin传入的对象merge到大Vue的options里
    this.options = mergeOptions(this.options, mixin)
    return this
  }
}
