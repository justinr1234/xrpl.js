import _ from 'lodash'
import { DepositPreauth, Wallet } from 'xrpl-local'

import serverUrl from '../serverUrl'
import {
  setupClient,
  teardownClient,
  type XrplIntegrationTestContext,
} from '../setup'
import { fundAccount, testTransaction } from '../utils'

// how long before each test case times out
const TIMEOUT = 20000

describe('DepositPreauth', () => {
  let testContext: XrplIntegrationTestContext

  beforeEach(async () => {
    testContext = await setupClient(serverUrl)
  })
  afterEach(async () => teardownClient(testContext))

  it(
    'base',
    async () => {
      const wallet2 = Wallet.generate()
      fundAccount(testContext.client, wallet2)
      const tx: DepositPreauth = {
        TransactionType: 'DepositPreauth',
        Account: testContext.wallet.classicAddress,
        Authorize: wallet2.classicAddress,
      }
      await testTransaction(testContext.client, tx, testContext.wallet)
    },
    TIMEOUT,
  )
})
