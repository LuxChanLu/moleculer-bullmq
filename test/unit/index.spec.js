/*
 * moleculer-bullmq
 * Copyright (c) 2020 Hugo Meyronneinc (https://github.com/Hugome/moleculer-bullmq)
 * MIT Licensed
 */

'use strict'

const { ServiceBroker } = require('moleculer')

const BullMqMixin = require('../../src/index.js')

describe('Basic test', () => {
  const broker = new ServiceBroker({ logger: false })
  const service = broker.createService({
    name: 'bullmq',
    mixins: [BullMqMixin]
  })

  beforeAll(() => broker.start())
  afterAll(() => broker.stop())

  it('basic it', async () => {
    expect(service).toBeDefined()
  })
})
