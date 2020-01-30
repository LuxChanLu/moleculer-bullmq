/*
 * moleculer-bullmq
 * Copyright (c) 2020 Hugo Meyronneinc (https://github.com/Hugome/moleculer-bullmq)
 * MIT Licensed
 */

'use strict'

const { Context } = require('moleculer')
const { Worker, Queue } = require('bullmq')

module.exports = {
  settings: {
    bullmq: {
      worker: {}
    }
  },
  created() {
    this.$queues = Object.entries(this.schema.actions).filter(([, { queue }]) => queue).map(([name]) => name)
    this.$queueResolved = {}
    if (this.$queues.length > 0) {
      this.$worker = new Worker(this.name, async job => {
        if (this.$queues.includes(job.name)) {
          const { params, meta } = job.data
          const ctx = Context.create(this.broker, undefined, params, { meta, timeout: 0 })
          ctx.locals.job = job
          await ctx.call(`${this.name}.${job.name}`, params)
        }
      }, { ...this.settings.bullmq.worker, connection: this.broker.cacher.client })
      const evt = (name, type, params) => {
        const event = [name, type].filter(Boolean).join('.')
        this.broker.emit(`${this.name}.${event}`, params)
        this.broker.broadcastLocal(event, params)
      }
      this.$worker.on('waiting', ({ id, name }) => evt(name, 'waiting', { id }))
      this.$worker.on('drained', () => evt('drained'))
      this.$worker.on('failed', ({ id, name }) => evt(name, 'failed', { id }))
      this.$worker.on('progress', ({ id, name }, progress) => evt(name, 'progress', { id, progress }))
      this.$worker.on('completed', ({ id, name }) => evt(name, 'completed', { id }))
    }
  },
  methods: {
    $resolve(name) {
      return this.$queueResolved[name] || (this.$queueResolved[name] = new Queue(this.name, { connection: this.broker.cacher.client }))
    },
    queue(name, action, params) {
      if (arguments.length <= 2) {
        action = name
        params = action
        name = this.name
      }
      return this.$resolve(name).add(action, { params, meta: this.currentContext.meta })
    },
    job(name, id) {
      if (arguments.length === 1) {
        id = name
        name = this.name
      }
      return this.$resolve(name).getJob(id)
    }
  }
}
