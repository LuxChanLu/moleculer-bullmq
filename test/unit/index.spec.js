/*
 * moleculer-bullmq
 * Copyright (c) 2020 Hugo Meyronneinc (https://github.com/Hugome/moleculer-bullmq)
 * MIT Licensed
 */

'use strict'

const { ServiceBroker, Context } = require('moleculer')
const RedisMock = require('redis-mock')
const WaitForExpect = require('wait-for-expect')
const BullMqMixin = require('../../src/index.js')

describe('Mixin', () => {
  const broker = new ServiceBroker({
    logger: false,
    cacher: {
      type: 'Redis',
      options: {
        redis: RedisMock.createClient(),
        lock: { ttl: 10 }
      }
    }
  })
  const service = broker.createService({
    name: 'jobs',
    mixins: [BullMqMixin],
    settings: {
      bullmq: {
        worker: { concurrency: 1 }
      }
    },
    actions: {
      resize: {
        queue: true,
        async handler(ctx) {
          const { width, height } = ctx.params
          const { bucket } = ctx.meta
          if (ctx.locals.job) {
            ctx.locals.job.updateProgress(100)
            return { bucket, size: width * height, job: ctx.locals.job.id }
          }
        }
      },
      payment: {
        queue: true,
        params: { amount: 'number' },
        async handler()  {
          throw new Error('Your too poor for this payment')
        }
      },
      'report.generate': {
        async handler() {
          const job = await this.localQueue('resize')
          await job.remove()
          return job
        }
      }
    }
  })
  const ctx = service.currentContext = Context.create(broker, undefined, undefined, { meta: { bucket: 'NGNLS2' } })
  const emitSpy = jest.spyOn(ctx, 'emit')
  const scheduler = broker.createService({ name: 'scheduler', mixins: [BullMqMixin] }) // Try without actions

  const expectJobEvent = (name, params) => {
    expect(emitSpy.mock.calls).toContainEqual([`${service.name}.${name}`, params])
    expect(emitSpy.mock.calls).toContainEqual([name, params, service.name])
  }

  beforeAll(() => broker.start())
  afterAll(() => broker.stop())

  it('should have a bull worker', () => expect(service.$worker).toBeDefined())

  it('should queue a successful job', async () => {
    const job = await service.localQueue('resize', { width: 42, height: 42 })
    await WaitForExpect(async () => {
      expect(emitSpy).toHaveBeenCalledTimes(8)

      expectJobEvent('resize.active', { id: job.id })
      expectJobEvent('resize.progress', { id: job.id, progress: 100 })
      expectJobEvent('resize.completed', { id: job.id })
      expectJobEvent('drained', undefined)

      const { returnvalue, progress } = await service.job(job.id)
      expect(returnvalue).toStrictEqual({ bucket: 'NGNLS2', size: 1764, job: job.id }) // This confirm the meta, params & locals has been passed to the job
      expect(progress).toBe(100)
    })
  })

  it('should queue a failed job', async () => {
    emitSpy.mockClear()
    const jobs = [await service.queue(service.name, 'payment', { amount: 2000 }, { priority: 200 }), await service.queue(service.name, 'payment')]
    await WaitForExpect(async () => {
      expect(emitSpy).toHaveBeenCalledTimes(10)

      expectJobEvent('payment.active', { id: jobs[0].id })
      expectJobEvent('payment.failed', { id: jobs[0].id })

      expectJobEvent('payment.active', { id: jobs[1].id })
      expectJobEvent('payment.failed', { id: jobs[1].id })

      expectJobEvent('drained', undefined)

      const errors = [await service.job(service.name, jobs[0].id), await service.job(service.name, jobs[1].id)]
      expect(errors[0].failedReason).toBe('Your too poor for this payment')
      expect(errors[1].failedReason).toBe('Parameters validation error!')
    })
  })

  it('should emit misc events', async () => {
    emitSpy.mockClear()
    const job = await ctx.call('jobs.report.generate')
    await service.pause()
    await service.resume()
    await scheduler.pause(service.name)
    await scheduler.resume(service.name)
    await scheduler.pause()
    await scheduler.resume()
    await WaitForExpect(() => {
      expect(emitSpy).toHaveBeenCalledTimes(12)

      expectJobEvent('removed', { id: job.id })
      expectJobEvent('paused')
      expectJobEvent( 'resumed')
    })
  })
})
