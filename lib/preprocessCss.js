// css preprocessor

require('colors')

const fs = require('fs')
const path = require('path')
const fse = require('fs-extra')
const klawSync = require('klaw-sync')
const prequire = require('parent-require')
const fileExists = require('./fileExists')
const getFunctionArgs = require('./getFunctionArgs')

module.exports = function (app, callback) {
  const params = app.get('params')
  const appName = app.get('appName')
  const cssPath = app.get('cssPath')
  const cssCompiledOutput = app.get('cssCompiledOutput')
  const usingWhitelist = !!params.cssCompilerWhitelist
  const logger = require('./logger')(app)
  let preprocessor
  let cssFiles
  let preprocessorModule
  let preprocessorArgs
  let versionFile
  let versionCode = '/* do not edit; generated automatically by Roosevelt */ '
  let promises = []

  if (params.cssCompiler === 'none' || params.cssCompiler === null) {
    callback()
    return
  }

  preprocessor = params.cssCompiler.nodeModule

  // require preprocessor
  try {
    preprocessorModule = prequire(preprocessor)
  } catch (err) {
    logger.error(`${appName} failed to include your CSS preprocessor! Please ensure that it is declared properly in your package.json and that it has been properly insalled to node_modules.\n`.red, err)
    logger.warn('CSS preprocessor has been disabled'.yellow)
    params.cssCompiler = 'none'
    callback()
    return
  }

  // examine API of preprocessor to ensure compatibility
  if (typeof preprocessorModule.parse === 'function') {
    preprocessorArgs = getFunctionArgs(preprocessorModule.parse)

    if ((preprocessorArgs.length !== 2) || (preprocessorArgs[0] !== 'app') || (preprocessorArgs[1] !== 'fileName')) {
      logger.error(`selected CSS compiler module ${preprocessor} out of date or incompatible with this version of Roosevelt.`.red.bold)
      process.exit()
    }
  } else {
    logger.error(`selected CSS compiler module ${preprocessor} out of date or incompatible with this version of Roosevelt.`.red.bold)
    process.exit()
  }

  // make css directory if not present
  if (!fileExists(cssPath)) {
    fse.mkdirsSync(cssPath)
    logger.log('📁', `${appName} making new directory ${cssPath}`.yellow)
  }

  // check if using whitelist before populating cssFiles
  if (usingWhitelist) {
    if (typeof params.cssCompilerWhitelist !== 'object') {
      logger.error('cssCompilerWhitelist not configured correctly. Please ensure that it is an array. See https://github.com/rooseveltframework/roosevelt#statics-parameters for configuration instructions'.red)
      callback()
      return
    } else {
      cssFiles = params.cssCompilerWhitelist
    }
  } else {
    cssFiles = klawSync(cssPath)
  }

  // make css directory if not present
  if (!fileExists(cssPath)) {
    fse.mkdirsSync(cssPath)
    logger.log('📁', `${appName} making new directory ${cssPath}`.yellow)
  }

  // make css compiled output directory if not present
  if (params.cssCompiler && params.cssCompiler.nodeModule && !fileExists(cssCompiledOutput)) {
    fse.mkdirsSync(cssCompiledOutput)
    logger.log('📁', `${appName} making new directory ${cssCompiledOutput}`.yellow)
  }

  // write versionedCssFile
  if (params.versionedCssFile) {
    if (!params.versionedCssFile.fileName || typeof params.versionedCssFile.fileName !== 'string') {
      logger.error(`${appName} failed to write versionedCssFile file! fileName missing or invalid`.red)
    } else if (!params.versionedCssFile.varName || typeof params.versionedCssFile.varName !== 'string') {
      logger.error(`${appName} failed to write versionedCssFile file! varName missing or invalid'`.red)
    } else {
      versionFile = path.join(cssPath, params.versionedCssFile.fileName)
      versionCode += preprocessorModule.versionCode(app)

      fs.openSync(versionFile, 'a') // create it if it does not already exist
      if (fs.readFileSync(versionFile, 'utf8') !== versionCode) {
        fs.writeFile(versionFile, versionCode, function (err) {
          if (err) {
            logger.error(`${appName} failed to write versionedCssFile file!\n`.red, err)
          } else {
            logger.log('📝', `${appName} writing new versionedCssFile to reflect new version ${app.get('appVersion')} to ${versionFile}`.green)
          }
        })
      }
    }
  }

  cssFiles.forEach((file) => {
    file = file.path || file
    promises.push(
      new Promise((resolve, reject) => {
        let split
        let altdest

        // parse whitelist and determine files exist
        if (usingWhitelist) {
          split = file.split(':')
          altdest = split[1]
          file = split[0]

          if (!fileExists(path.join(cssPath, file))) {
            reject(new Error(`${file} specified in cssCompilerWhitelist does not exist. Please ensure file is entered properly.`))
          }
        }

        if (file === '.' || file === '..' || file === 'Thumbs.db' || fs.lstatSync(usingWhitelist ? path.join(cssPath, file) : file).isDirectory()) {
          resolve()
          return
        }

        file = file.replace(cssPath, '')

        preprocessorModule.parse(app, file)
          .then(([newFile, newCSS]) => {
            newFile = path.join(cssCompiledOutput, (altdest || newFile))

            // create build directory
            fse.mkdirsSync(path.dirname(newFile))

            // create file if it doesn't exist
            fs.openSync(newFile, 'a')

            // check existing file for matching content before writing
            if (fs.readFileSync(newFile, 'utf8') !== newCSS) {
              fs.writeFile(newFile, newCSS, function (err) {
                if (err) {
                  console.error(`${appName} failed to write new CSS file ${newFile}`.red)
                  reject(err)
                } else {
                  logger.log('📝', `${appName} writing new CSS file ${newFile}`.green)
                }
                resolve()
              })
            } else {
              resolve()
            }
          })
          .catch((err) => {
            console.error(`${appName} failed to parse ${file}. Please ensure that it is coded correctly.`.red)
            reject(err)
          })
      })
    )
  })

  Promise.all(promises)
    .then(() => {
      callback()
    })
    .catch((err) => {
      logger.error(`${err}`.red)
      process.exit()
    })
}
