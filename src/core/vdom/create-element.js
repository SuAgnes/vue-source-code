/* @flow */

import config from '../config'
import VNode, { createEmptyVNode } from './vnode'
import { createComponent } from './create-component'
import { traverse } from '../observer/traverse'

import {
  warn,
  isDef,
  isUndef,
  isTrue,
  isObject,
  isPrimitive,
  resolveAsset
} from '../util/index'

import {
  normalizeChildren,
  simpleNormalizeChildren
} from './helpers/index'

const SIMPLE_NORMALIZE = 1
const ALWAYS_NORMALIZE = 2

// wrapper function for providing a more flexible interface
// without getting yelled at by flow
// 6-1-1 createElement
export function createElement (
  context: Component, // vm实例
  tag: any, //  vnode的tag标签
  data: any, // vnode相关数据
  children: any, // 子vnode
  normalizationType: any,
  alwaysNormalize: boolean
): VNode | Array<VNode> {
  /* 6-1-2 当没有data的时候 就会把后面的参数往前移 */
  if (Array.isArray(data) || isPrimitive(data)) {
    normalizationType = children
    children = data
    data = undefined
  }
  if (isTrue(alwaysNormalize)) {
    normalizationType = ALWAYS_NORMALIZE
  }
  /* 6-1-3 createElement实际上最后是调用了_createElement，这里的createElement只是为_createElement做了一层参数封装
  都处理好了后到_createElement里去真正的处理vnode */
  return _createElement(context, tag, data, children, normalizationType)
}

export function _createElement (
  context: Component,
  tag?: string | Class<Component> | Function | Object,
  data?: VNodeData,
  children?: any,
  normalizationType?: number
): VNode | Array<VNode> {
  /* 6-1-4 data是否是响应式的，当把一个对象调用defineReactive的时候，就会给对象添加一个.__ob__属性
  一旦有.__ob__这个属性，就说明是响应式的，这段代码↓判断data如果是响应式的，就会报出一个警告，然后调用createEmptyVNode */
  if (isDef(data) && isDef((data: any).__ob__)) {
    process.env.NODE_ENV !== 'production' && warn(
      `Avoid using observed data object as vnode data: ${JSON.stringify(data)}\n` +
      'Always create fresh vnode data objects in each render!',
      context
    )
    return createEmptyVNode()
  }
  // object syntax in v-bind
  /* 6-1-6 比如在component:is的时候回有is属性，判断如果component:is不是真值的话，返回注释节点。 */
  if (isDef(data) && isDef(data.is)) {
    tag = data.is
  }
  if (!tag) {
    // in case of component :is set to falsy value
    return createEmptyVNode()
  }
  // warn against non-primitive key
  /* 6-1-7 对key等等做一些校验，比如说key不是基础类型就会报错 */
  if (process.env.NODE_ENV !== 'production' &&
    isDef(data) && isDef(data.key) && !isPrimitive(data.key)
  ) {
    if (!__WEEX__ || !('@binding' in data.key)) {
      warn(
        'Avoid using non-primitive value as key, ' +
        'use string/number value instead.',
        context
      )
    }
  }
  /* 6-1-8  slot处理 */
  // support single function children as default scoped slot
  if (Array.isArray(children) &&
    typeof children[0] === 'function'
  ) {
    data = data || {}
    data.scopedSlots = { default: children[0] }
    children.length = 0
  }
  /* 6-1-9 对所有的children做normalize */
  if (normalizationType === ALWAYS_NORMALIZE) {
    children = normalizeChildren(children)
  } else if (normalizationType === SIMPLE_NORMALIZE) {
    children = simpleNormalizeChildren(children)
  }
  /* 6-2-1 _createElement做的第二件事就是创建vnode */
  let vnode, ns
  /* 6-2-2 对tag做一些判断，tag可以是string，也可以是一个组件 */
  if (typeof tag === 'string') {
    let Ctor
    ns = (context.$vnode && context.$vnode.ns) || config.getTagNamespace(tag)
    /* 6-2-3 config.isReservedTag(tag)看这些标签是不是html的原生标签 */
    if (config.isReservedTag(tag)) {
      // platform built-in elements
      // 如果修饰符用在原生html标签上，并且是开发环境，就会抛出一个警告，说修饰符只在组件上有效
      // 12-1-7 在渲染vnode时会执行createElement方法，判断如果tag是string，并且是保留标签（html）标签，就创建一个vnode
      if (process.env.NODE_ENV !== 'production' && isDef(data) && isDef(data.nativeOn)) {
        warn(
          `The .native modifier for v-on is only valid on components but it was used on <${tag}>.`,
          context
        )
      }
      /* 6-2-4 创建平台的保留标签，然后把data/children等都创建进去，去实例化一个vnode */
      vnode = new VNode(
        config.parsePlatformTagName(tag), data, children,
        undefined, undefined, context
      )
    } else if ((!data || !data.pre) && isDef(Ctor = resolveAsset(context.$options, 'components', tag))) {
      // component
      // 12-1-8 否则创建组件vnode
      /* 12-1-16
        所以说我们如果通过Vue.components去定义的话，实际上会在Vue.options.components下去扩展了一个定义
        在resolveAsset的时候，通过tag（写的标签），从而去解析到我们的定义，再把构造器传入createComponent中
        这样就可以创建一个组件的vnode */
      /* 12-3-4 这里的createComponent 和 下面的 vnode = createComponent(tag, data, context, children) 有点不同，下面的tag已经是一个对象了，而这里的tag还是字符串
        我们通过resolveAsset拿到这个组件的构造器，在去执行createComponent
      */
      vnode = createComponent(Ctor, data, context, children, tag)
    } else {
      // unknown or unlisted namespaced elements
      // check at runtime because it may get assigned a namespace when its
      // parent normalizes children
      /* 12-1-15 找不到走到这个逻辑 */
      // 6-2-5 陌生节点直接创建一个vnode
      vnode = new VNode(
        tag, data, children,
        undefined, undefined, context
      )
    }
  } else {
    // direct component options / constructor
    /* 8-1-1 
    如果是 new Vue({
      el: '#app',
      render(h) {
        return h(App)
      }
    })
    这种形式的话，实际上传入的就不是一个字符串（例如div），而是一个组件对象（object类型）*/
    vnode = createComponent(tag, data, context, children)
  }
  if (Array.isArray(vnode)) {
    // 6-2-6 把vnode作为createElement的返回值返回出去
    return vnode
  } else if (isDef(vnode)) {
    if (isDef(ns)) applyNS(vnode, ns)
    if (isDef(data)) registerDeepBindings(data)
    return vnode
  } else {
    return createEmptyVNode()
  }
}

function applyNS (vnode, ns, force) {
  vnode.ns = ns
  if (vnode.tag === 'foreignObject') {
    // use default namespace inside foreignObject
    ns = undefined
    force = true
  }
  if (isDef(vnode.children)) {
    for (let i = 0, l = vnode.children.length; i < l; i++) {
      const child = vnode.children[i]
      if (isDef(child.tag) && (
        isUndef(child.ns) || (isTrue(force) && child.tag !== 'svg'))) {
        applyNS(child, ns, force)
      }
    }
  }
}

// ref #5318
// necessary to ensure parent re-render when deep bindings like :style and
// :class are used on slot nodes
function registerDeepBindings (data) {
  if (isObject(data.style)) {
    traverse(data.style)
  }
  if (isObject(data.class)) {
    traverse(data.class)
  }
}
