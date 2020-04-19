/* @flow */
import * as nodeOps from 'web/runtime/node-ops'
import { createPatchFunction } from 'core/vdom/patch'
import baseModules from 'core/vdom/modules/index'
import platformModules from 'web/runtime/modules/index'

// the directive module should be applied last, after all
// built-in modules have been applied.
/* 7-1-5 modules其实就是在web/runtime/modules/index下定义了很多class、attrs的钩子函数 在path过程中，会调用不同模块的钩子函数 */
const modules = platformModules.concat(baseModules)
/* 7-1-3 调用createPatchFunction 返回一个函数  */
/* 7-1-8 在调用这个patch的时候，实际上就是调用7-1-7的patch
  这边用了函数柯里化，在这定义patch的时候，传入nodeOps, modules都是和平台相关的，因为vuejs是跨端的（web/weex），两端操作不同
  虽然同样生成watchDom，但是生成的方法不同，这边相关的逻辑使用nodeOps，其次modules的生命周期相关，也与平台相关（platformModules），
  所以使用函数柯里化把这两个参数一次性传入，好处是避免了大量的if else，使用函数柯里化第一次就可以搞定差异，之后真正执行path的时候，并不会再次判断。
  因为我们在调用path的时候，已经把path提前传入了，也就是使用闭包实现了对nodeOps, modules的持有，接下来调用方法时候就不需要再去传这些差异化的参数 */
export const patch: Function = createPatchFunction({ nodeOps, modules })
