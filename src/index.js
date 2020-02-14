/*
 * moleculer-bullmq
 * Copyright (c) 2020 Hugo Meyronneinc (https://github.com/Hugome/moleculer-bullmq)
 * MIT Licensed
 */

'use strict'

const { Context } = require('moleculer')
const { Worker, Queue, QueueEvents } = require('bullmq')
const IORedis = require('ioredis')

module.exports = {
  settings: {
    bullmq: {
      worker: {},
      passContext: false
    }
  },
  hooks: {
    before: {
      '*': '$populateJob'
    }
  },
  created() {
    this.$queues = Object.entries(this.schema.actions || {}).filter(([, { queue }]) => queue).map(([name]) => name)
    this.$queueResolved = {}
    this.$client = this.settings.bullmq.client ? new IORedis(this.settings.bullmq.client) : this.broker.cacher.client
  },
  started() {
    if (this.$queues.length > 0) {
      this.$worker = new Worker(this.name, async job => {
        const { params, meta, parentCtx } = job.data
        meta.job = { id: job.id, queue: this.name }
        return Context.create(this.broker, undefined, params, { meta, timeout: 0, parentCtx }).call(`${this.name}.${job.name}`, params)
      }, { ...this.settings.bullmq.worker, client: this.$client })
      this.$events = new QueueEvents(this.name, { client: this.$client })
      this.$events.on('active', ({ jobId }) => this.$transformEvent(jobId, 'active'))
      this.$events.on('removed', ({ jobId }) => this.$transformEvent(jobId, 'removed'))
      this.$events.on('progress', ({ jobId, data }) => this.$transformEvent(jobId, 'progress', { progress: data }))
      this.$events.on('failed', ({ jobId }) => this.$transformEvent(jobId, 'failed'))
      this.$events.on('error', ({ jobId }) => this.$transformEvent(jobId, 'error'))
      this.$events.on('completed', ({ jobId }) => this.$transformEvent(jobId, 'completed'))
      this.$events.on('drained', () => this.$transformEvent('drained'))
      this.$events.on('paused', () => this.$transformEvent('paused'))
      this.$events.on('resumed', () => this.$transformEvent('resumed'))
      this.$events.on('cleaned', (jobs, type) => this.$transformEvent(null, 'cleaned', { jobs: jobs.map(({ id }) => id), type }))
    }
  },
  async stopped() {
    if (this.$worker) {
      await this.$worker.close()
    }
    if (this.$events) {
      await this.$events.close()
    }
    await Promise.all(Object.values(this.$queueResolved).map(queue => queue.close()))
  },
  methods: {
    $resolve(name) {
      if (!this.$queueResolved[name]) {
        this.$queueResolved[name] = new Queue(name, { client: this.$client })
      }
      return this.$queueResolved[name]
    },
    pause(name) {
      if (name) {
        return this.$resolve(name).pause()
      } else if (this.$worker) {
        return this.$worker.pause()
      }
    },
    resume(name) {
      if (name) {
        return this.$resolve(name).resume()
      } else if (this.$worker) {
        return this.$worker.resume()
      }
    },
    queue(ctx, name, action, params, options) {
      return this.$resolve(name).add(action, { params, meta: ctx.meta, parentCtx: this.settings.bullmq.passContext ? ctx: undefined }, options)
    },
    localQueue(ctx, action, params, options) {
      return this.queue(ctx, this.name, action, params, options)
    },
    job(name, id) {
      if (arguments.length === 1) {
        id = name
        name = this.name
      }
      return this.$resolve(name).getJob(id)
    },
    async $populateJob (ctx) {
      ctx.locals.job = ctx.meta && ctx.meta.job ? await this.job(ctx.meta.job.queue, ctx.meta.job.id) : undefined
    },
    async $transformEvent (id, type, params) {
      const event = arguments.length === 1 ? [id] : [type]
      if (arguments.length >= 2 && id) {
        const job = await this.job(id)
        if (job && job.name) {
          event.unshift(job.name)
        }
        params = params || {}
        params.id = id
      }
      const name = event.join('.')
      this.broker.emit(`${this.name}.${name}`, params)
      this.broker.emit(name, params, this.name)
    }
  }
}
