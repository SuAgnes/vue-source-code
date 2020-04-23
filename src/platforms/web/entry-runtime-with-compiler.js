/* @flow */
// 2-1 vue入口
import config from 'core/config'
import { warn, cached } from 'core/util/index'
import { mark, measure } from 'core/util/perf'
// 4-1-2 定义Vue.prototype.$mount方法 ↓↓
import Vue from './runtime/index'
import { query } from './util/index'
import { compileToFunctions } from './compiler/index'
import { shouldDecodeNewlines, shouldDecodeNewlinesForHref } from './util/compat'

const idToTemplate = cached(id => {
  const el = query(id)
  return el && el.innerHTML
})

/* 4-1-1 实例挂载的实现首先，获得mount方法，然后重新定义了这个方法
  重新定义是因为./runtime/index文件是给runtime-only使用的mount，而里面没有下面的这些逻辑
  在compiler版本里执行$mount方法时候实际上要调用下面这个函数
  runtime + compiler 版本之所以要重新定义 $mount 方法，是因为它要先执行一遍把组件对象中可能定义的 template 编译生成 render 函数的过程。而 runtime-only 版本只支持在组件对象中定义 render 函数。也就是说 runtime + compiler 版本的 $mount 会多做一步编译模板，后面的流程都一样的，所以可以复用后面的 mount 逻辑。*/
const mount = Vue.prototype.$mount
Vue.prototype.$mount = function (
  el?: string | Element,
  hydrating?: boolean
): Component {
  // 4-1-3 见query函数
  el = el && query(el)
  /* istanbul ignore if */
  /* 4-1-4 拿到el后，el已经是一个dom对象，然后再次做一次判断
  el如果是body或者是文档标签（HTML）就会报一个错“你的vue不可以直接挂载到body或html上”
  因为挂在会覆盖，而我们不可以覆盖body或html
  这就是我们为什么用div#app这种方式去做，而不是挂载body上 */
  if (el === document.body || el === document.documentElement) {
    process.env.NODE_ENV !== 'production' && warn(
      `Do not mount Vue to <html> or <body> - mount to normal elements instead.`
    )
    return this
  }

  const options = this.$options
  // resolve template/el and convert to render function
/* 4-2-1 然后拿到options，这里会判断有没有定义render方法（手写app#vue的时候） */
  if (!options.render) {
    // 4-2-2 判断有没有写new vue中有没有template
    // 4-3-1 如果没有options.render就把它转化为template
    let template = options.template
    if (template) {
      /* 4-2-3 如果有template，会对template做一些处理。if是如果template是字符串情况 */
      if (typeof template === 'string') {
        if (template.charAt(0) === '#') {
          template = idToTemplate(template)
          /* istanbul ignore if */
          if (process.env.NODE_ENV !== 'production' && !template) {
            warn(
              `Template element not found or is empty: ${options.template}`,
              this
            )
          }
        }
      } else if (template.nodeType) {
        // 4-2-4 如果template是dom对象就会去取innerHTML
        template = template.innerHTML
      } else {
        if (process.env.NODE_ENV !== 'production') {
          warn('invalid template option:' + template, this)
        }
        return this
      }
    } else if (el) {
        // 4-2-5 没有template情况，就调用getOuterHTML，这个方法最终返回一个字符串
      template = getOuterHTML(el)
    }
    if (template) {
      /* istanbul ignore if */
      // 4-2-8 编译相关
      if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
        mark('compile')
      }

      /* 4-3-2 这个template最终会编译成render，也就是说，无论用什么方法，vue最终只认render函数 */
      const { render, staticRenderFns } = compileToFunctions(template, {
        outputSourceRange: process.env.NODE_ENV !== 'production',
        shouldDecodeNewlines,
        shouldDecodeNewlinesForHref,
        delimiters: options.delimiters,
        comments: options.comments
      }, this)
      options.render = render
      options.staticRenderFns = staticRenderFns

      /* istanbul ignore if */
      if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
        mark('compile end')
        measure(`vue ${this._name} compile`, 'compile', 'compile end')
      }
    }
  }
  /* 4-3-3 如果有render函数就可以直接调用mount方法，如果没有就会把模板转化，编译生成render()，然后调用 ↓↓
    这个mount就是之前在上面定义的mount 见runtime/index.js */
  return mount.call(this, el, hydrating)
  // 9-2-3 因为组件在编译过程中就会生产render方法，所以会直接执行mount.call(this, el, hydrating)
}

/**
 * Get outerHTML of elements, taking care
 * of SVG elements in IE as well.
 */
/* 4-2-6 拿到dom对象的outerHTML方法 */
function getOuterHTML (el: Element): string {
  if (el.outerHTML) {
    return el.outerHTML
  } else {
    // 4-2-7 没有outerHTML的话就在外面包一层再执行innerHTML, 其实就是要拿到html，拿到html就相当于拿到了div#app这个dom
    const container = document.createElement('div')
    container.appendChild(el.cloneNode(true))
    return container.innerHTML
  }
}

Vue.compile = compileToFunctions

export default Vue
