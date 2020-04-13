import { initMixin } from './init'
import { stateMixin } from './state'
import { renderMixin } from './render'
import { eventsMixin } from './events'
import { lifecycleMixin } from './lifecycle'
import { warn } from '../util/index'
// 2-2-3 ES5实现class的方式 通过函数 为什么不用class呢，拿initMixin举个例子
function Vue (options) {
  if (process.env.NODE_ENV !== 'production' &&
    !(this instanceof Vue) 
  ) {
    // 2-2-1 vue必须要通过new的方法去实例它
    warn('Vue is a constructor and should be called with the `new` keyword')
  }
  this._init(options) // 3-1-1 这个init其实是在initMixin里定义的
}
// 2-2-5 每个mixin其实都是往vue的原型上去混入一些方法，不用ES6是因为ES5的写法可以更方便的往原型上挂载很多方法，并且可以把这些方法拆分到不同的文件下（↓例如这些mixin)，方便代码管理
initMixin(Vue)
stateMixin(Vue)
eventsMixin(Vue)
lifecycleMixin(Vue)
renderMixin(Vue)

export default Vue
// 2-2-6 其实vue本身就是用函数去实现的一个类，类上挂载了很多原形方法，除了mixin，在runtime/index.js里也定义了很多原形方法

// 去2-3-1查看全局方法 core/index.js