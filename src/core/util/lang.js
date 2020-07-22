/* @flow */

/**
 * unicode letters used for parsing html tags, component names and property paths.
 * using https://www.w3.org/TR/html53/semantics-scripting.html#potentialcustomelementname
 * skipping \u10000-\uEFFFF due to it freezing up PhantomJS
 */
export const unicodeRegExp = /a-zA-Z\u00B7\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u037D\u037F-\u1FFF\u200C-\u200D\u203F-\u2040\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD/

/**
 * Check if a string starts with $ or _
 */
export function isReserved (str: string): boolean {
  const c = (str + '').charCodeAt(0)
  return c === 0x24 || c === 0x5F
}

/**
 * Define a property.
 */
// 14-1-14 定义def def对defineProperty做了一层封装
export function def (obj: Object, key: string, val: any, enumerable?: boolean) {
  Object.defineProperty(obj, key, {
    value: val,
    enumerable: !!enumerable,
    writable: true,
    configurable: true
  })
}

/**
 * Parse simple path.
 */
const bailRE = new RegExp(`[^${unicodeRegExp.source}.$_\\d]`)
export function parsePath (path: string): any {
  if (bailRE.test(path)) {
    return
  }
  // 18-2-14 把路径变成数组
  const segments = path.split('.')
  return function (obj) {
    // 18-2-15 遍历数组 通过path来访问对象
    for (let i = 0; i < segments.length; i++) {
      if (!obj) return
      /* 18-2-19 因为此处会求值，那么求值就会做一次访问，所以在访问过程中就会建立整个依赖收集（访问会触发getter，getter又会触发defineRetive上的getter函数，就会触发dep.depend，执行后就会把user watcher订阅到dep中，一旦数据发生变化就会执行user watcher的update）
        也就是说watcher去观测的数据发生了变化后，就会执行user-watcher的update,user-watcher update就会执行
        else if (this.sync) {
          this.run()
        } else {
          queueWatcher(this)
        }
        queueWatcher 就是把watcher放到watcher队列中 
      */
      //  18-3-6 因为obj是传入的vm实例，所以可以这样访问obj[segments[i]]，就会触发_data对象，然后通过vm._data.xx 访问到 进而触发getter
      obj = obj[segments[i]]
    }
    return obj
  }
}
