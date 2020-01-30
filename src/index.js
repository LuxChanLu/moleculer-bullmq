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
      this.$worker.on('waiting', ({ id, name }) => this.broker.emit(`${this.name}.${name}.waiting`, { id }))
      this.$worker.on('drained', ({ id, name }) => this.broker.emit(`${this.name}.${name}.drained`, { id }))
      this.$worker.on('completed', ({ id, name }) => this.broker.emit(`${this.name}.${name}.completed`, { id }))
      this.$worker.on('failed', ({ id, name }) => this.broker.emit(`${this.name}.${name}.failed`, { id }))
      this.$worker.on('progress', ({ id, name }, progress) => this.broker.emit(`${this.name}.${name}.progress`, { id, progress }))
      this.$worker.on('completed', ({ id, name }) => this.broker.emit(`${this.name}.${name}.completed`, { id }))
    }
  },
  methods: {
    queue(name, action, params) {
      const queue = this.$queueResolved[name] || (this.$queueResolved[name] = new Queue(this.name, { connection: this.broker.cacher.client }))
      return queue.add(action, { params, meta: this.currentContext.meta })
    }
  }
}
