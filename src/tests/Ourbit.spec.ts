import * as chai from 'chai'
import * as spies from 'chai-spies'
import { clone, types } from 'mobx-state-tree'
import 'mocha'
import * as uuid from 'uuid'

import Ourbit from '../Ourbit'
import { SequelizePersistInterface } from '../stores'
import MockPersistInterface, { mockPatch, mockTransaction } from './helpers/MockPersistInterface'

const { expect, use } = chai
use(spies)
const sandbox = chai.spy.sandbox()

// Helpers
const KittyTracker = types
  .model('KittyTracker', {
    ownerOf: types.optional(types.map(types.string), {}),
  })
  .actions((self) => ({
    transfer (tokenId, to) {
      self.ownerOf.set(tokenId, to)
    },
  }))

const Store = types.model('Store', {
  kittyTracker: types.optional(KittyTracker, {}),
})

describe('Ourbit', () => {
  let ourbit = null
  let stateReference = null
  const storeInterface = new MockPersistInterface()
  let testFn = null

  beforeEach(() => {
    // tslint:disable-next-line
    chai.spy.on(uuid, 'v4', () => {
      return 'mockPatch'
    })

    stateReference = Store.create({
      kittyTracker: KittyTracker.create(),
    })

    testFn = () => {
      stateReference.kittyTracker.transfer('0x12345', '0x0987')
    }

    sandbox.on(storeInterface, ['getTransactions', 'deleteTransaction', 'saveTransaction', 'getTransaction'])

    ourbit = new Ourbit(stateReference, storeInterface)
  })

  afterEach(() => {
    sandbox.restore()
    // tslint:disable-next-line
    chai.spy.restore(uuid)
  })

  describe('- processTransaction()', () => {
    it('should call saveTransaction with appropriate info', async () => {

      ourbit.processTransaction('mockTransaction', testFn)
      expect(storeInterface.saveTransaction).to.have.been.called.with(mockTransaction)
    })

    it('should emit `patch` events', async () => {
      const spy = chai.spy()
      ourbit.on('patch', spy)

      await ourbit.processTransaction('mockTransaction', testFn)
      // tslint:disable-next-line no-unused-expression
      expect(spy).to.have.been.called.once
    })
  })

  describe('- rollbackTransaction()', () => {
    it('should call deleteTransaction with appropriate info', async () => {
      await ourbit.rollbackTransaction('mockTransaction')

      expect(storeInterface.deleteTransaction).to.have.been.called.with(mockTransaction)
    })

    it('should emit `patch` events', async () => {
      await ourbit.processTransaction('mockTransaction', testFn)

      const spy = chai.spy()
      ourbit.on('patch', spy)

      await ourbit.rollbackTransaction('mockTransaction')
      // tslint:disable-next-line no-unused-expression
      expect(spy).to.have.been.called.once
    })

    it('should rollback stateReference to previous state', async () => {
      await ourbit.processTransaction('mockTransaction', testFn)

      let ownerOf = stateReference.kittyTracker.ownerOf.get('0x12345')
      expect(ownerOf).to.equal('0x0987')

      await ourbit.rollbackTransaction('mockTransaction')

      ownerOf = stateReference.kittyTracker.ownerOf.get('0x12345')
      expect(ownerOf).to.equal(undefined)
    })
  })

  describe('- resumeFromTxId()', () => {
    it('should call getTransactions with appropriate info', async () => {
      await ourbit.resumeFromTxId('mockTransaction')

      expect(storeInterface.getTransactions).to.have.been.called.with('mockTransaction')
    })

    it('should  not emit `patch` events', async () => {
      const spy = chai.spy()
      ourbit.on('patch', spy)

      await ourbit.resumeFromTxId('mockTransaction')
      // tslint:disable-next-line no-unused-expression
      expect(spy).to.not.have.been.called.once
    })

    it('should bring stateReference to current state', async () => {
      await ourbit.resumeFromTxId('mockTransaction')
      const ownerOf = stateReference.kittyTracker.ownerOf.get('0x12345')

      expect(ownerOf).to.equal('0x0987')
    })
  })
})
