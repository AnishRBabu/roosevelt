/* eslint-env mocha */

const assert = require('assert')
const cleanupTestApp = require('./util/cleanupTestApp')
const { fork } = require('child_process')
const fs = require('fs-extra')
const generateTestApp = require('./util/generateTestApp')
const path = require('path')
const request = require('supertest')

describe('view engines', function () {
  const appDir = path.join(__dirname, 'app/viewEngine')

  // options to pass into test app generator
  const options = { rooseveltPath: '../../../roosevelt', method: 'startServer', stopServer: true }

  beforeEach(function (done) {
    // copy the mvc directory into the test app directory for each test
    fs.copySync(path.join(__dirname, './util/mvc'), path.join(appDir, 'mvc'))
    done()
  })

  afterEach(function (done) {
    // clean up the test app directory after each test
    cleanupTestApp(appDir, (err) => {
      if (err) {
        throw err
      } else {
        done()
      }
    })
  })

  it('should render the teddy test page', function (done) {
    // generate the test app
    generateTestApp({
      appDir,
      makeBuildArtifacts: true,
      viewEngine: [
        'html: teddy'
      ],
      onServerStart: '(app) => {process.send(app.get("params"))}'
    }, options)

    // fork and run app.js as a child process
    const testApp = fork(path.join(appDir, 'app.js'), { stdio: ['pipe', 'pipe', 'pipe', 'ipc'] })

    // when the app starts and sends a message back to the parent try and request the test page
    testApp.on('message', (params) => {
      request(`http://localhost:${params.port}`)
        .get('/teddyTest')
        .expect(200, (err, res) => {
          if (err) {
            assert.fail(err)
            testApp.send('stop')
          }
          // test that the values rendered on the page are correct
          const test1 = res.text.includes('Teddy Test')
          const test2 = res.text.includes('Heading Test')
          const test3 = res.text.includes('This is the first sentence that I am grabbing from my teddy model')
          const test4 = res.text.includes('This is the second sentence that I am grabbing from my teddy model')
          assert.strictEqual(test1, true)
          assert.strictEqual(test2, true)
          assert.strictEqual(test3, true)
          assert.strictEqual(test4, true)
          testApp.send('stop')
        })

      // when the child process exits, finish the test
      testApp.on('exit', () => {
        done()
      })
    })
  })

  it('should be able to handle multiple viewEngines', function (done) {
    // generate the test app
    generateTestApp({
      appDir,
      makeBuildArtifacts: true,
      viewEngine: [
        'html: teddy',
        'jcs: ../test/util/jcsTemplate'
      ],
      onServerStart: '(app) => {process.send(app.get("view engine"))}'
    }, options)

    // fork and run app.js as a child process
    const testApp = fork(path.join(appDir, 'app.js'), { stdio: ['pipe', 'pipe', 'pipe', 'ipc'] })

    // checks to see if the view engine returned is the first element
    testApp.on('message', (viewEngine) => {
      assert.strictEqual(viewEngine, 'html', 'The view Engine has been set to something else other than the first element')
      testApp.send('stop')
    })

    // when the child process exits, finish the test
    testApp.on('exit', () => {
      done()
    })
  })

  it('should be able to use view engines that are functions and do not have an __express function', function (done) {
    // generate the test app
    generateTestApp({
      appDir,
      makeBuildArtifacts: true,
      viewEngine: [
        'jcs: ../test/util/jcsTemplate'
      ],
      onServerStart: '(app) => {process.send(app.get("params"))}'
    }, options)

    // fork and run app.js as a child process
    const testApp = fork(path.join(appDir, 'app.js'), { stdio: ['pipe', 'pipe', 'pipe', 'ipc'] })

    // when the app starts test the custom view engine
    testApp.on('message', (params) => {
      request(`http://localhost:${params.port}`)
        .get('/jcsTest')
        .expect(200, (err, res) => {
          if (err) {
            assert.fail(err)
            testApp.send('stop')
          }
          assert.strictEqual(res.text.includes('jcs Test'), true)
          assert.strictEqual(res.text.includes('jcsHeader'), true)
          assert.strictEqual(res.text.includes('jcsParagraph'), true)
          testApp.send('stop')
        })
    })

    // when the child process exits, finish the test
    testApp.on('exit', () => {
      done()
    })
  })

  it('should throw an Error if the ViewEngine parameter is formatted incorrectly', function (done) {
    // bool var to hold whether or not the error of the viewEngine param being formatted incorrectly was thrown
    let viewEngineFormattedIncorrectlyBool = false

    // generate the test app
    generateTestApp({
      makeBuildArtifacts: true,
      appDir,
      viewEngine: [
        'html: teddy: blah'
      ],
      onServerStart: '(app) => {process.send(app.get("params"))}'
    }, options)

    // fork and run app.js as a child process
    const testApp = fork(path.join(appDir, 'app.js'), ['--dev'], { stdio: ['pipe', 'pipe', 'pipe', 'ipc'] })

    // listen to the stream errors for the view engine error
    testApp.stderr.on('data', (data) => {
      if (data.includes('fatal error: viewEngine param must be formatted')) {
        viewEngineFormattedIncorrectlyBool = true
      }
    })

    // when the app starts, kill it
    testApp.on('message', () => {
      testApp.send('stop')
    })

    // when the child process exits, test the assertion and finish the test
    testApp.on('exit', () => {
      assert.strictEqual(viewEngineFormattedIncorrectlyBool, true, 'Roosevelt did not throw an error when the way viewEngine was formatted incorrectly')
      done()
    })
  })

  it('should throw an Error if the module passed into viewEngine is nonExistent', function (done) {
    let viewEngineConfiguredIncorrectlyBool = false

    // generate the test app
    generateTestApp({
      makeBuildArtifacts: true,
      appDir,
      viewEngine: [
        'html: teddyza'
      ],
      onServerStart: '(app) => {process.send(app.get("params"))}'
    }, options)

    // fork and run app.js as a child process
    const testApp = fork(path.join(appDir, 'app.js'), ['--dev'], { stdio: ['pipe', 'pipe', 'pipe', 'ipc'] })

    // look at the error log and see if the error shows up
    testApp.stderr.on('data', (data) => {
      if (data.includes('Failed to register viewEngine')) {
        viewEngineConfiguredIncorrectlyBool = true
      }
    })

    // when the app is starting, kill it
    testApp.on('message', () => {
      testApp.send('stop')
    })

    // when the child process exits, test the assertion and finish the test
    testApp.on('exit', () => {
      assert.strictEqual(viewEngineConfiguredIncorrectlyBool, true, 'Roosevelt did not throw an error when the ViewEngine contains a node module that does not exists')
      done()
    })
  })

  it('should be able to set the viewEngine if it was just a string', function (done) {
    // generate the test app
    generateTestApp({
      makeBuildArtifacts: true,
      appDir,
      viewEngine: 'html: teddy',
      onServerStart: '(app) => {process.send(app.get("params"))}'
    }, options)

    // fork and run app.js as a child process
    const testApp = fork(path.join(appDir, 'app.js'), ['--dev'], { stdio: ['pipe', 'pipe', 'pipe', 'ipc'] })

    // when the app finishes its initialization, send a request to the teddy page
    testApp.on('message', (params) => {
      request(`http://localhost:${params.port}`)
        .get('/teddyTest')
        .expect(200, (err, res) => {
          if (err) {
            assert.fail(err)
            testApp.send('stop')
          }
          // test the data rendered on the default teddy page
          const test1 = res.text.includes('Teddy Test')
          const test2 = res.text.includes('Heading Test')
          const test3 = res.text.includes('This is the first sentence that I am grabbing from my teddy model')
          const test4 = res.text.includes('This is the second sentence that I am grabbing from my teddy model')
          assert.strictEqual(test1, true)
          assert.strictEqual(test2, true)
          assert.strictEqual(test3, true)
          assert.strictEqual(test4, true)
          testApp.send('stop')
        })
    })

    // when the child process exits, finish the test
    testApp.on('exit', () => {
      done()
    })
  })
})
