/* eslint-disable max-statements -- test has a lot of statements */
import net from 'net'

import { assert } from 'chai'
import _ from 'lodash'
import {
  Client,
  ConnectionError,
  DisconnectedError,
  NotConnectedError,
  ResponseFormatError,
  XrplError,
  TimeoutError,
} from 'xrpl-local'
import { Connection } from 'xrpl-local/client/connection'

import rippled from './fixtures/rippled'
import {
  setupClient,
  teardownClient,
  type XrplTestContext,
} from './setupClient'
import { assertRejects, ignoreWebSocketDisconnect } from './testUtils'

// how long before each test case times out
const TIMEOUT = 20000

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Necessary to get browser info
const isBrowser = (process as any).browser

async function createServer(): Promise<net.Server> {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.on('listening', function () {
      resolve(server)
    })
    server.on('error', function (error) {
      reject(error)
    })
    server.listen(0, '0.0.0.0')
  })
}

describe('Connection', () => {
  let clientContext: XrplTestContext

  beforeEach(async () => {
    clientContext = await setupClient()
  })
  afterEach(async () => teardownClient(clientContext))

  it(
    'default options',
    () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Need to access private methods
      const connection: any = new Connection('url')
      assert.strictEqual(connection.getUrl(), 'url')
      assert(connection.config.proxy == null)
      assert(connection.config.authorization == null)
    },
    TIMEOUT,
  )

  describe('trace', () => {
    let mockedRequestData
    let mockedResponse
    let expectedMessages
    let originalConsoleLog

    beforeEach(() => {
      mockedRequestData = { mocked: 'request' }
      mockedResponse = JSON.stringify({ mocked: 'response', id: 0 })
      expectedMessages = [
        // We add the ID here, since it's not a part of the user-provided request.
        ['send', JSON.stringify({ ...mockedRequestData, id: 0 })],
        ['receive', mockedResponse],
      ]
      // eslint-disable-next-line no-console -- Testing trace
      originalConsoleLog = console.log
    })

    afterEach(() => {
      // eslint-disable-next-line no-console -- Testing trace
      console.log = originalConsoleLog
    })

    it(
      'as false',
      async () => {
        const messages: Array<[number | string, string]> = []
        // eslint-disable-next-line no-console -- Testing trace
        console.log = function (id: number, message: string): void {
          messages.push([id, message])
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Need to access private methods
        const connection: any = new Connection('url', { trace: false })
        connection.ws = {
          send(): void {
            /* purposefully empty */
          },
        }
        await connection.request(mockedRequestData)
        connection.onMessage(mockedResponse)
        assert.deepEqual(messages, [])
      },
      TIMEOUT,
    )

    it(
      'as true',
      async () => {
        const messages: Array<[number | string, string]> = []
        // eslint-disable-next-line no-console -- Testing trace
        console.log = function (id: number | string, message: string): void {
          messages.push([id, message])
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Need to access private methods
        const connection: any = new Connection('url', { trace: true })
        connection.ws = {
          send(): void {
            /* purposefully empty */
          },
        }
        await connection.request(mockedRequestData)
        connection.onMessage(mockedResponse)
        assert.deepEqual(messages, expectedMessages)
      },
      TIMEOUT,
    )

    it(
      'as a function',
      async () => {
        const messages: Array<[number | string, string]> = []
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Need to access private methods
        const connection: any = new Connection('url', {
          trace(id: number | string, message: string): void {
            messages.push([id, message])
          },
        })
        connection.ws = {
          send(): void {
            /* purposefully empty */
          },
        }
        await connection.request(mockedRequestData)
        connection.onMessage(mockedResponse)
        assert.deepEqual(messages, expectedMessages)
      },
      TIMEOUT,
    )
  })

  it(
    'with proxy',
    async () => {
      if (isBrowser) {
        return
      }
      const server = await createServer()
      const port = (server.address() as net.AddressInfo).port
      const options = {
        proxy: `ws://localhost:${port}`,
        authorization: 'authorization',
        trustedCertificates: ['path/to/pem'],
      }
      const connection = new Connection(
        // @ts-expect-error -- Testing private member
        clientContext.client.connection.url,
        options,
      )
      const expect = 'CONNECT localhost'

      const connectionPromise = new Promise<void>((resolve) => {
        server.on('connection', (socket) => {
          socket.on('data', (data) => {
            const got = data.toString('ascii', 0, expect.length)
            assert.strictEqual(got, expect)
            server.close()
            connection.disconnect()
            resolve()
          })
        })
      })

      await connection.connect().catch((err) => {
        assert(err instanceof NotConnectedError)
      })

      await connectionPromise
    },
    TIMEOUT,
  )

  it(
    'Multiply disconnect calls',
    async () => {
      await clientContext.client.disconnect()
      await clientContext.client.disconnect()
    },
    TIMEOUT,
  )

  it(
    'reconnect',
    async () => {
      await clientContext.client.connection.reconnect()
    },
    TIMEOUT,
  )

  it(
    'NotConnectedError',
    async () => {
      const connection = new Connection('url')
      return connection
        .request({
          command: 'ledger',
          ledger_index: 'validated',
        })
        .then(() => {
          assert.fail('Should throw NotConnectedError')
        })
        .catch((error) => {
          assert(error instanceof NotConnectedError)
        })
    },
    TIMEOUT,
  )

  it(
    'should throw NotConnectedError if server not responding ',
    async () => {
      if (isBrowser) {
        if (navigator.userAgent.includes('PhantomJS')) {
          // inside PhantomJS this one just hangs, so skip as not very relevant
          return
        }
      }

      // Address where no one listens
      const connection = new Connection('ws://testripple.circleci.com:129')
      const errorPromise = new Promise((resolve) => {
        connection.on('error', resolve)
      })

      await connection.connect().catch((error) => {
        assert(error instanceof NotConnectedError)
      })

      await errorPromise
    },
    TIMEOUT,
  )

  it(
    'DisconnectedError',
    async () => {
      await clientContext.client
        .request({ command: 'test_command', data: { closeServer: true } })
        .then(() => {
          assert.fail('Should throw DisconnectedError')
        })
        .catch((error) => {
          assert(error instanceof DisconnectedError)
        })
    },
    TIMEOUT,
  )

  it(
    'TimeoutError',
    async () => {
      // @ts-expect-error -- Testing private member
      clientContext.client.connection.ws.send = function (
        _ignore,
        sendCallback,
      ): void {
        sendCallback(null)
      }
      const request = { command: 'server_info' }
      await clientContext.client.connection
        .request(request, 10)
        .then(() => {
          assert.fail('Should throw TimeoutError')
        })
        .catch((error) => {
          assert(error instanceof TimeoutError)
        })
    },
    TIMEOUT,
  )

  it(
    'DisconnectedError on send',
    async () => {
      // @ts-expect-error -- Testing private member
      clientContext.client.connection.ws.send = function (
        _ignore,
        sendCallback,
      ): void {
        sendCallback({ message: 'not connected' })
      }
      await clientContext.client
        .request({ command: 'server_info' })
        .then(() => {
          assert.fail('Should throw DisconnectedError')
        })
        .catch((error) => {
          assert(error instanceof DisconnectedError)
          assert.strictEqual(error.message, 'not connected')
        })
    },
    TIMEOUT,
  )

  it(
    'DisconnectedError on initial onOpen send',
    async () => {
      /*
       * onOpen previously could throw PromiseRejectionHandledWarning: Promise rejection was handled asynchronously
       * do not rely on the client.setup hook to test this as it bypasses the case, disconnect client connection first
       */
      await clientContext.client.disconnect()

      /*
       * stub _onOpen to only run logic relevant to test case
       */
      // @ts-expect-error -- Overriding function
      clientContext.client.connection.onceOpen = (): void => {
        /*
         * overload websocket send on open when _ws exists
         */
        // @ts-expect-error -- Testing private member
        clientContext.client.connection.ws.send = function (_0, _1, _2): void {
          // recent ws throws this error instead of calling back
          throw new XrplError(
            'WebSocket is not open: readyState 0 (CONNECTING)',
          )
        }
        const request = { command: 'subscribe', streams: ['ledger'] }
        clientContext.client.connection.request(request)
      }

      try {
        await clientContext.client.connect()
      } catch (error) {
        if (!(error instanceof Error)) {
          throw error
        }

        assert.instanceOf(error, DisconnectedError)
        assert.strictEqual(
          error.message,
          'WebSocket is not open: readyState 0 (CONNECTING)',
        )
      }
    },
    TIMEOUT,
  )

  it(
    'ResponseFormatError',
    async () => {
      await clientContext.client
        .request({
          command: 'test_command',
          data: { unrecognizedResponse: true },
        })
        .then(() => {
          assert.fail('Should throw ResponseFormatError')
        })
        .catch((error) => {
          assert(error instanceof ResponseFormatError)
        })
    },
    TIMEOUT,
  )

  it(
    'reconnect on unexpected close',
    async () => {
      const connectedPromise = new Promise<void>((resolve) => {
        clientContext.client.connection.on('connected', () => {
          resolve()
        })
      })

      setTimeout(() => {
        // @ts-expect-error -- Testing private member
        clientContext.client.connection.ws.close()
      }, 1)

      await connectedPromise
    },
    TIMEOUT,
  )

  describe('reconnection test', () => {
    it('reconnect on several unexpected close', async () => {
      if (isBrowser) {
        if (navigator.userAgent.includes('PhantomJS')) {
          // inside PhantomJS this one just hangs, so skip as not very relevant
          return
        }
      }
      async function breakConnection(): Promise<void> {
        await clientContext.client.connection
          .request({
            command: 'test_command',
            data: { disconnectIn: 10 },
          })
          .catch(ignoreWebSocketDisconnect)
      }

      let connectsCount = 0
      let disconnectsCount = 0
      let reconnectsCount = 0
      let code = 0
      clientContext.client.connection.on('reconnecting', () => {
        reconnectsCount += 1
      })
      clientContext.client.connection.on('disconnected', (_code) => {
        code = _code
        disconnectsCount += 1
      })
      const num = 3

      const connectedPromise = new Promise<void>((resolve, reject) => {
        clientContext.client.connection.on('connected', () => {
          connectsCount += 1
          if (connectsCount < num) {
            breakConnection()
          }
          if (connectsCount === num) {
            if (disconnectsCount !== num) {
              reject(
                new XrplError(
                  `disconnectsCount must be equal to ${num}(got ${disconnectsCount} instead)`,
                ),
              )
            } else if (reconnectsCount !== num) {
              reject(
                new XrplError(
                  `reconnectsCount must be equal to ${num} (got ${reconnectsCount} instead)`,
                ),
              )
              // eslint-disable-next-line no-negated-condition -- Necessary
            } else if (code !== 1006) {
              reject(
                new XrplError(
                  `disconnect must send code 1006 (got ${code} instead)`,
                ),
              )
            } else {
              resolve()
            }
          }
        })
      })

      await breakConnection()
      await connectedPromise
    }, 70001)
  })

  it('reconnect event on heartbeat failure', async () => {
    if (isBrowser) {
      if (navigator.userAgent.includes('PhantomJS')) {
        // inside PhantomJS this one just hangs, so skip as not very relevant
        return
      }
    }

    /*
     * Set the heartbeat to less than the 1 second ping response
     */
    // @ts-expect-error -- Testing private member
    clientContext.client.connection.config.timeout = 500

    const reconnectPromise = new Promise((resolve) => {
      // Hook up a listener for the reconnect event
      clientContext.client.connection.on('reconnect', () => resolve)
    })

    /*
     * Trigger a heartbeat
     */
    // @ts-expect-error -- Testing private member
    await clientContext.client.connection.heartbeat().catch((_error) => {
      /* Ignore error */
    })

    await reconnectPromise
  }, 5000)

  it('heartbeat failure and reconnect failure', async () => {
    if (isBrowser) {
      if (navigator.userAgent.includes('PhantomJS')) {
        // inside PhantomJS this one just hangs, so skip as not very relevant
        return
      }
    }

    /*
     * Set the heartbeat to less than the 1 second ping response
     */
    // @ts-expect-error -- Testing private member
    clientContext.client.connection.config.timeout = 500
    // fail on reconnect/connection
    clientContext.client.connection.reconnect = async (): Promise<void> => {
      throw new XrplError('error on reconnect')
    }

    const errorPromise = new Promise<void>((resolve) => {
      // Hook up a listener for the reconnect error event
      clientContext.client.on('error', (error, message) => {
        if (error === 'reconnect' && message === 'error on reconnect') {
          return resolve()
        }
        throw new XrplError('Expected error on reconnect')
      })
    })

    /*
     * Trigger a heartbeat
     */
    // @ts-expect-error -- Testing private member
    await clientContext.client.connection.heartbeat()

    await errorPromise
  }, 5000)

  it(
    'should emit disconnected event with code 1000 (CLOSE_NORMAL)',
    async () => {
      const disconnectedPromise = new Promise<void>((resolve) => {
        clientContext.client.once('disconnected', (code) => {
          assert.strictEqual(code, 1000)
          resolve()
        })
      })

      await clientContext.client.disconnect()
      await disconnectedPromise
    },
    TIMEOUT,
  )

  it(
    'should emit disconnected event with code 1006 (CLOSE_ABNORMAL)',
    async () => {
      const errorPromise = new Promise<void>((resolve, reject) => {
        clientContext.client.connection.once('error', (error) => {
          reject(new XrplError(`should not throw error, got ${String(error)}`))
        })

        setTimeout(resolve, 5000)
      })

      const disconnectedPromise = new Promise<void>((resolve) => {
        clientContext.client.connection.once('disconnected', (code) => {
          assert.strictEqual(code, 1006)
          resolve()
        })
      })

      await clientContext.client.connection
        .request({
          command: 'test_command',
          data: { disconnectIn: 10 },
        })
        .catch(ignoreWebSocketDisconnect)

      await Promise.all([errorPromise, disconnectedPromise])
    },
    TIMEOUT,
  )

  it(
    'should emit connected event on after reconnect',
    async () => {
      const connectedPromise = new Promise<void>((resolve) => {
        clientContext.client.once('connected', resolve)
      })

      // @ts-expect-error -- Testing private member
      clientContext.client.connection.ws.close()
      await connectedPromise
    },
    TIMEOUT,
  )

  it(
    'Multiply connect calls',
    async () => {
      await clientContext.client.connect()
      await clientContext.client.connect()
    },
    TIMEOUT,
  )

  it(
    'Cannot connect because no server',
    async () => {
      const connection = new Connection(undefined as unknown as string)
      return connection
        .connect()
        .then(() => {
          assert.fail('Should throw ConnectionError')
        })
        .catch((error) => {
          assert(
            error instanceof ConnectionError,
            'Should throw ConnectionError',
          )
        })
    },
    TIMEOUT,
  )

  it(
    'connect multiserver error',
    () => {
      assert.throws(function () {
        // eslint-disable-next-line no-new -- Testing constructor
        new Client({
          servers: ['wss://server1.com', 'wss://server2.com'],
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Testing invalid constructor
        } as any)
      }, XrplError)
    },
    TIMEOUT,
  )

  it(
    'connect throws error',
    async () => {
      const errorPromise = new Promise<void>((resolve) => {
        clientContext.client.once('error', (type, info) => {
          assert.strictEqual(type, 'type')
          assert.strictEqual(info, 'info')
          resolve()
        })
      })

      clientContext.client.connection.emit('error', 'type', 'info')
      return errorPromise
    },
    TIMEOUT,
  )

  it(
    'emit stream messages',
    async () => {
      let transactionCount = 0
      let pathFindCount = 0
      clientContext.client.connection.on('transaction', () => {
        transactionCount += 1
      })
      clientContext.client.connection.on('path_find', () => {
        pathFindCount += 1
      })

      const responsePromise = new Promise<void>((resolve) => {
        clientContext.client.connection.on('response', (message) => {
          assert.strictEqual(message.id, 1)
          assert.strictEqual(transactionCount, 1)
          assert.strictEqual(pathFindCount, 1)
          resolve()
        })
      })

      // @ts-expect-error -- Testing private member
      clientContext.client.connection.onMessage(
        JSON.stringify({
          type: 'transaction',
        }),
      )
      // @ts-expect-error -- Testing private member
      clientContext.client.connection.onMessage(
        JSON.stringify({
          type: 'path_find',
        }),
      )
      // @ts-expect-error -- Testing private member
      clientContext.client.connection.onMessage(
        JSON.stringify({
          type: 'response',
          id: 1,
        }),
      )

      await responsePromise
    },
    TIMEOUT,
  )

  it(
    'invalid message id',
    async () => {
      const errorPromise = new Promise<void>((resolve) => {
        clientContext.client.on('error', (errorCode, errorMessage, message) => {
          assert.strictEqual(errorCode, 'badMessage')
          assert.strictEqual(errorMessage, 'valid id not found in response')
          assert.strictEqual(message, '{"type":"response","id":{}}')
          resolve()
        })
      })

      // @ts-expect-error -- Testing private member
      clientContext.client.connection.onMessage(
        JSON.stringify({
          type: 'response',
          id: {},
        }),
      )

      await errorPromise
    },
    TIMEOUT,
  )

  it(
    'propagates error message',
    async () => {
      const errorPromise = new Promise<void>((resolve) => {
        clientContext.client.on('error', (errorCode, errorMessage, data) => {
          assert.strictEqual(errorCode, 'slowDown')
          assert.strictEqual(errorMessage, 'slow down')
          assert.deepEqual(data, {
            error: 'slowDown',
            error_message: 'slow down',
          })
          resolve()
        })
      })

      // @ts-expect-error -- Testing private member
      clientContext.client.connection.onMessage(
        JSON.stringify({
          error: 'slowDown',
          error_message: 'slow down',
        }),
      )

      await errorPromise
    },
    TIMEOUT,
  )

  it(
    'propagates RippledError data',
    async () => {
      const request = { command: 'subscribe', streams: 'validations' }
      clientContext.mockRippled?.addResponse(
        request.command,
        rippled.subscribe.error,
      )

      await clientContext.client.request(request).catch((error) => {
        assert.strictEqual(error.name, 'RippledError')
        assert.strictEqual(error.data.error, 'invalidParams')
        assert.strictEqual(error.message, 'Invalid parameters.')
        assert.strictEqual(error.data.error_code, 31)
        assert.strictEqual(error.data.error_message, 'Invalid parameters.')
        assert.deepEqual(error.data.request, {
          command: 'subscribe',
          id: 0,
          streams: 'validations',
        })
      })
    },
    TIMEOUT,
  )

  it(
    'unrecognized message type',
    async () => {
      const unknownPromise = new Promise<void>((resolve) => {
        /*
         * This enables us to automatically support any
         * new messages added by rippled in the future.
         */
        clientContext.client.connection.on('unknown', (event) => {
          assert.deepEqual(event, { type: 'unknown' })
          resolve()
        })
      })

      // @ts-expect-error -- Testing private member
      clientContext.client.connection.onMessage(
        JSON.stringify({ type: 'unknown' }),
      )

      await unknownPromise
    },
    TIMEOUT,
  )

  /*
   * it('should clean up websocket connection if error after websocket is opened', async function () {
   *   await this.client.disconnect()
   *   // fail on connection
   *   this.client.connection.subscribeToLedger = async () => {
   *     throw new Error('error on _subscribeToLedger')
   *   }
   *   try {
   *     await this.client.connect()
   *     throw new Error('expected connect() to reject, but it resolved')
   *   } catch (err) {
   *     assert(err.message === 'error on _subscribeToLedger')
   *     // _ws.close event listener should have cleaned up the socket when disconnect _ws.close is run on connection error
   *     // do not fail on connection anymore
   *     this.client.connection.subscribeToLedger = async () => {}
   *     await this.client.connection.reconnect()
   *   }
   * })
   */

  it('should try to reconnect on empty subscribe response on reconnect', async () => {
    const errorPromise = new Promise<void>((resolve, reject) => {
      clientContext.client.on('error', (error) => {
        if (error) {
          reject(error)
        }

        reject(new XrplError('Should not emit error.'))
      })

      setTimeout(resolve, 5000)
    })

    let disconnectedCount = 0

    const connectedPromise = new Promise<void>((resolve) => {
      clientContext.client.on('connected', () => {
        if (disconnectedCount !== 1) {
          throw new XrplError('Wrong number of disconnects')
        }

        resolve()
      })
    })

    clientContext.client.on('disconnected', () => {
      disconnectedCount += 1
    })
    clientContext.client.connection.request({
      command: 'test_command',
      data: { disconnectIn: 5 },
    })

    await Promise.all([errorPromise, connectedPromise])
  }, 23000)

  it(
    'should not crash on error',
    async () => {
      if (clientContext.mockRippled) {
        clientContext.mockRippled.suppressOutput = true
      }

      await new Promise<void>((resolve, reject) => {
        clientContext.client.connection
          .request({
            command: 'test_garbage',
          })
          .then(() => reject(new XrplError('Should not have succeeded')))
          .catch(resolve)
      })
    },
    TIMEOUT,
  )

  it(
    'should throw error if pending response with same ID',
    async () => {
      const promise1 = clientContext.client.connection.request({
        id: 'test',
        command: 'ping',
      })
      const promise2 = clientContext.client.connection.request({
        id: 'test',
        command: 'ping',
      })
      await assertRejects(
        Promise.all([promise1, promise2]),
        XrplError,
        "Response with id 'test' is already pending",
      )
    },
    TIMEOUT,
  )
})
