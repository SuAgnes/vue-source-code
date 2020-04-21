// src 源码目录
  // compiler 编译相关
    // -watchDom-reder function
    // template → reder funciton在compiler
  // core
    // 内置组件: component keep-alive 
    // global-api>extend mixin
  // instance
    // render-helpers 渲染辅助函数
    // 渲染 初始化 生命周期
  // observer
    // 响应式相关
  // util
    // 一些工具方法
  // vdom
    // virtual dom的一些方法
// platforms
  // web 浏览器程序（平时开发）
  // weex 类似rn的跨端应用
  // 也就是说vue可以编译出在浏览器运行的框架js, 也可以编译运行到weex这个平台下
  // 美团开发的mp-vue也就是在这个目录下扩展了一个mpvue的目录，里面会放一些跟平台相关的编译与运行代码-util等等
  // 我们从不同平台的入口就可以编译出不同的vue.js
// server
  // 服务端渲染
// sfc
  // 是一个简单的解释器，可以把单文件编译出一个js对象
// shared
  // 辅助方法，可以被core或cpmpiler等等与platforms目录共享的一些辅助方法会放到这个目录下