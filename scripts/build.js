// 1-4 build.js分析

// 1-5 定义依赖模块
const fs = require('fs')
const path = require('path')
const zlib = require('zlib')
const rollup = require('rollup')
const terser = require('terser')

if (!fs.existsSync('dist')) {
  fs.mkdirSync('dist')
}
// 1-6-1 拿到要构建的所有的配置 详见config.js 1-7
let builds = require('./config').getAllBuilds() // 1-15 也就是说build就是一个数组
// 1-15-2 因为我们会编译生成不同的vuejs，所以我们回根据我们传的参数if (process.argv[2])
// 1-16 也就是说首先通过config拿到所有的配置，然后通过filters去过滤不需要的，最终就是需要编译的。
// filter builds via command line arg
// 1-16-2 拿到配置后做过滤
if (process.argv[2]) {
  // 1-15-3 如果有这些参数，它就会根据传的参数通过filters把不需要的打包的给过滤掉，如果没有参数的话就把weex给过滤掉（也就是打包web平台）
  const filters = process.argv[2].split(',')
  builds = builds.filter(b => {
    return filters.some(f => b.output.file.indexOf(f) > -1 || b._name.indexOf(f) > -1)
  })
} else {
  // filter out weex builds by default
  builds = builds.filter(b => {
    return b.output.file.indexOf('weex') === -1
  })
}
// 1-16-3 最后调用build函数做真正的构建过程
build(builds)

function build (builds) {
  let built = 0
  const total = builds.length
  // 1-17 定义了一个next方法，当next执行时就调用buildEntry
  const next = () => {
    buildEntry(builds[built]).then(() => {
      built++ // 1-17-2 计数器 去一个个编译
      if (built < total) {
        next()
      }
    }).catch(logError)
  }

  next()
}
// 1-18 buildEntry这个方法就是拿到我们builds的config
function buildEntry (config) {
  const output = config.output
  const { file, banner } = output
  const isProd = /(min|prod)\.js$/.test(file) // 1-19-2 是否是生产环境
  // 1-18-2 这个config就是作为最终rollup所编译需要的config↓↓
  return rollup.rollup(config)
    .then(bundle => bundle.generate(output)) // 1-18-3 config编译完后拿到bundle,bundle通过generate生成output
    .then(({ output: [{ code }] }) => { // 1-18-4 output对应我们生成的目标
      if (isProd) {// 1-19-3 这个文件是否以min或prod.js结尾，如果是就再做一次压缩
        // 1-19 可能会对code做一些修改，比如说判断是否需要压缩
        const minified = (banner ? banner + '\n' : '') + terser.minify(code, {
          toplevel: true,
          output: {
            ascii_only: true
          },
          compress: {
            pure_funcs: ['makeMap']
          }
        }).code
        // 1-19-4 最终调用write生成到dist目录下
        return write(file, minified, true)
      } else {
        return write(file, code)
      }
    })
}

function write (dest, code, zip) {
  return new Promise((resolve, reject) => {
    function report (extra) {
      // 1-20 生成过程中可以打印一些log信息
      console.log(blue(path.relative(process.cwd(), dest)) + ' ' + getSize(code) + (extra || ''))
      resolve()
    }

    fs.writeFile(dest, code, err => {
      if (err) return reject(err)
      if (zip) {
        zlib.gzip(code, (err, zipped) => {
          if (err) return reject(err)
          report(' (gzipped: ' + getSize(zipped) + ')')
        })
      } else {
        report()
      }
    })
  })
}

function getSize (code) {
  return (code.length / 1024).toFixed(2) + 'kb'
}

function logError (e) {
  console.log(e)
}

function blue (str) {
  return '\x1b[1m\x1b[34m' + str + '\x1b[39m\x1b[22m'
}
