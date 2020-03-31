const path = require('path')

const resolve = p => path.resolve(__dirname, '../', p)
// 1-9-2 path.resolv 是nodejs提供的一个路径解析的方法，__dirname为当前目录，然后往上找一级（vue大目录），再传参。
// 1-9 返回一个对象
module.exports = {
  // 1-9-3 找的vue大目录下的src/platforms/web/entry-runtime-with-compiler
  // 1-9-4 alias其实就是提供了一个到最终真实文件地址的一个映射关系，通过key的方式获取
  // 1-10 拿config.js中builds的第一个对象举例 详见config.js
  vue: resolve('src/platforms/web/entry-runtime-with-compiler'),
  compiler: resolve('src/compiler'),
  core: resolve('src/core'),
  shared: resolve('src/shared'),
  // 1-10-2 web对应↓
  web: resolve('src/platforms/web'),
  weex: resolve('src/platforms/weex'),
  server: resolve('src/server'),
  sfc: resolve('src/sfc')
}
