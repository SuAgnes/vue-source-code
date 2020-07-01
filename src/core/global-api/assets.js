/* @flow */

import { ASSET_TYPES } from 'shared/constants'
import { isPlainObject, validateComponentName } from '../util/index'

export function initAssetRegisters (Vue: GlobalAPI) {
  /**
   * Create asset registration methods.
   */
  // 12-1-1 全局组件注册，ASSET_TYPES中扩展了component、directive、filter
  ASSET_TYPES.forEach(type => {
    Vue[type] = function (
      id: string,
      definition: Function | Object
    ): Function | Object | void {
      if (!definition) {
        return this.options[type + 's'][id]
      } else {
        /* istanbul ignore if */
        // 12-1-2 校验组件名
        if (process.env.NODE_ENV !== 'production' && type === 'component') {
          validateComponentName(id)
        }
        // 12-1-3 判断如果是component方法 并且是一个普通对象
        if (type === 'component' && isPlainObject(definition)) {
          // 12-1-4 如果没有name, 以id为准
          definition.name = definition.name || id
          // 12-1-5 通过extend 转换成构造器
          definition = this.options._base.extend(definition)
        }
        if (type === 'directive' && typeof definition === 'function') {
          definition = { bind: definition, update: definition }
        }
        // 12-1-6 执行完后，会把构造器赋值给this.options.components.id，也就是对全局大Vue扩展了一些定义
        this.options[type + 's'][id] = definition
        return definition
      }
    }
  })
}
